package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Conversation;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.repository.ConversationRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The "unread messages" email: to whom, what it links to, and that each side counts as told. */
class ChatMailNotifierTest {

    private static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");
    private static final OffsetDateTime NOW_UTC = NOW.atOffset(ZoneOffset.UTC);

    private final ConversationRepository conversations = mock(ConversationRepository.class);
    private final EmailSenderService emailSender = mock(EmailSenderService.class);
    private ChatMailNotifier notifier;
    private Client client;
    private Professional professional;
    private Conversation conversation;

    @BeforeEach
    void setUp() {
        notifier = new ChatMailNotifier(conversations, emailSender, Clock.fixed(NOW, ZoneOffset.UTC), 6, "https://oficiosya.test/");
        client = Client.builder().name("Carla").email("carla@example.com").build();
        professional = Professional.builder().name("Pablo").email("pablo@example.com").build();
        conversation = Conversation.builder().id(7L).client(client).professional(professional).build();
        when(conversations.findUnreadToMailClientSide(any(), any())).thenReturn(List.of());
        when(conversations.findUnreadToMailProfessionalSide(any(), any())).thenReturn(List.of());
    }

    @Test
    void theClientSide_isMailedAboutTheProfessional_andMarkedAsTold() {
        when(conversations.findUnreadToMailClientSide(any(), any())).thenReturn(List.of(conversation));

        notifier.mailUnread();

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendNotification(eq("carla@example.com"), eq("Tenés mensajes sin leer de Pablo"), body.capture());
        assertTrue(body.getValue().contains("Hola Carla,"));
        assertTrue(body.getValue().contains("https://oficiosya.test/messages/7"));
        assertEquals(NOW_UTC, conversation.getClientUnreadMailAt());
    }

    @Test
    void theProfessionalSide_isMailedAboutTheClient() {
        when(conversations.findUnreadToMailProfessionalSide(any(), any())).thenReturn(List.of(conversation));

        notifier.mailUnread();

        verify(emailSender).sendNotification(eq("pablo@example.com"), eq("Tenés mensajes sin leer de Carla"), anyString());
        assertEquals(NOW_UTC, conversation.getProfessionalUnreadMailAt());
    }

    @Test
    void withTheEmailsOff_nothingIsSent_butTheSideStillCountsAsTold() {
        client.setEmailNotifications(false);
        when(conversations.findUnreadToMailClientSide(any(), any())).thenReturn(List.of(conversation));

        notifier.mailUnread();

        verify(emailSender, never()).sendNotification(anyString(), anyString(), anyString());
        assertEquals(NOW_UTC, conversation.getClientUnreadMailAt());
    }

    @Test
    void looksForMessagesUnreadSinceTheGrace_andSidesNotToldWithinTheInterval() {
        notifier.mailUnread();

        verify(conversations).findUnreadToMailClientSide(NOW_UTC.minus(ChatMailNotifier.UNREAD_FOR), NOW_UTC.minusHours(6));
    }
}
