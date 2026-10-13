package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.ChatMessageCreateRequest;
import com.um.uy.oficiosya.dto.response.ChatMessageResponse;
import com.um.uy.oficiosya.dto.response.ChatParticipantResponse;
import com.um.uy.oficiosya.dto.response.ConversationResponse;
import com.um.uy.oficiosya.entity.ChatMessageType;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.exception.ConversationNotFoundException;
import com.um.uy.oficiosya.exception.GlobalExceptionHandler;
import com.um.uy.oficiosya.service.interfaces.ChatService;
import com.um.uy.oficiosya.service.interfaces.ChatService.FoundOrCreated;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Each chat endpoint acts as the caller identified by the token; status codes and the JSON shape. */
class ConversationControllerTest {

    private static final String BASE = "/api/v1/conversations";

    @Mock
    private ChatService chatService;

    private MockMvc mvc;
    private final UUID userId = UUID.randomUUID();
    private final UUID professionalId = UUID.randomUUID();
    private final Authentication authentication =
            new UsernamePasswordAuthenticationToken(userId.toString(), "n/a", List.of());

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mvc = MockMvcBuilders
                .standaloneSetup(new ConversationController(chatService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private MockHttpServletRequestBuilder signedIn(MockHttpServletRequestBuilder request, String body) {
        return request.principal(authentication).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private ConversationResponse conversation() {
        return new ConversationResponse(12L,
                new ChatParticipantResponse(professionalId, "Ana Pérez", "/uploads/ana.jpg", Role.PROFESSIONAL),
                Role.CLIENT, "¿Puedes el jueves?", OffsetDateTime.parse("2026-10-12T21:30:00-03:00"), 2, true, false);
    }

    private ChatMessageResponse message(UUID clientMessageId) {
        return new ChatMessageResponse(345L, 12L, ChatMessageType.TEXT, userId, "Hola", clientMessageId, 87L,
                OffsetDateTime.parse("2026-10-12T21:30:00-03:00"));
    }

    // --- open from the profile ---

    @Test
    void openConversation_new_is201WithItsLocationAndTheConversation() throws Exception {
        when(chatService.openWithProfessional(professionalId, userId)).thenReturn(new FoundOrCreated<>(conversation(), true));

        mvc.perform(signedIn(post(BASE), """
                        {"professionalId":"%s"}""".formatted(professionalId)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "http://localhost/api/v1/conversations/12"))
                .andExpect(jsonPath("$.id").value(12))
                .andExpect(jsonPath("$.otherParticipant.id").value(professionalId.toString()))
                .andExpect(jsonPath("$.otherParticipant.name").value("Ana Pérez"))
                .andExpect(jsonPath("$.otherParticipant.profileImageUrl").value("/uploads/ana.jpg"))
                .andExpect(jsonPath("$.otherParticipant.role").value("PROFESSIONAL"))
                .andExpect(jsonPath("$.myRole").value("CLIENT"))
                .andExpect(jsonPath("$.lastMessagePreview").value("¿Puedes el jueves?"))
                .andExpect(jsonPath("$.unreadCount").value(2))
                .andExpect(jsonPath("$.canWrite").value(true))
                .andExpect(jsonPath("$.blockedByMe").value(false));
    }

    @Test
    void openConversation_existing_is200() throws Exception {
        when(chatService.openWithProfessional(professionalId, userId)).thenReturn(new FoundOrCreated<>(conversation(), false));

        mvc.perform(signedIn(post(BASE), """
                        {"professionalId":"%s"}""".formatted(professionalId)))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(jsonPath("$.id").value(12));
    }

    @Test
    void openConversation_withoutAProfessional_is400() throws Exception {
        mvc.perform(signedIn(post(BASE), "{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.professionalId").exists());
        verifyNoInteractions(chatService);
    }

    @Test
    void openConversation_unknownOrUnpublishedProfessional_is404() throws Exception {
        when(chatService.openWithProfessional(professionalId, userId))
                .thenThrow(new ClientNotFoundException("Profesional no encontrado."));

        mvc.perform(signedIn(post(BASE), """
                        {"professionalId":"%s"}""".formatted(professionalId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Profesional no encontrado."));
    }

    @Test
    void openConversation_pastTheDailyLimit_is429() throws Exception {
        when(chatService.openWithProfessional(professionalId, userId)).thenThrow(new ResponseStatusException(
                HttpStatus.TOO_MANY_REQUESTS, "Llegaste al límite de conversaciones nuevas por hoy, probá de nuevo mañana"));

        mvc.perform(signedIn(post(BASE), """
                        {"professionalId":"%s"}""".formatted(professionalId)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(jsonPath("$.error").value("Llegaste al límite de conversaciones nuevas por hoy, probá de nuevo mañana"));
    }

    @Test
    void openConversation_withoutAToken_is401() throws Exception {
        mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content("""
                        {"professionalId":"%s"}""".formatted(professionalId)))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(chatService);
    }

    // --- inbox ---

    @Test
    void getConversations() throws Exception {
        when(chatService.getConversations(userId)).thenReturn(List.of(conversation()));

        mvc.perform(get(BASE).principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(12))
                .andExpect(jsonPath("$[0].otherParticipant.name").value("Ana Pérez"));
    }

    @Test
    void getUnreadCount() throws Exception {
        when(chatService.getUnreadCount(userId)).thenReturn(5L);

        mvc.perform(get(BASE + "/unread-count").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(5));
    }

    @Test
    void getConversations_withoutAToken_is401() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mvc.perform(get(BASE + "/unread-count")).andExpect(status().isUnauthorized());
    }

    // --- history ---

    @Test
    void getMessages_passesTheCursorAndTheLimit() throws Exception {
        UUID clientMessageId = UUID.randomUUID();
        when(chatService.getMessages(12L, userId, 400L, 50)).thenReturn(List.of(message(clientMessageId)));

        mvc.perform(get(BASE + "/12/messages").param("before", "400").param("limit", "50").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(345))
                .andExpect(jsonPath("$[0].conversationId").value(12))
                .andExpect(jsonPath("$[0].type").value("TEXT"))
                .andExpect(jsonPath("$[0].senderId").value(userId.toString()))
                .andExpect(jsonPath("$[0].content").value("Hola"))
                .andExpect(jsonPath("$[0].clientMessageId").value(clientMessageId.toString()))
                .andExpect(jsonPath("$[0].jobRequestId").value(87));
    }

    @Test
    void getMessages_withoutParams_leavesThemToTheService() throws Exception {
        when(chatService.getMessages(12L, userId, null, null)).thenReturn(List.of());

        mvc.perform(get(BASE + "/12/messages").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void getMessages_notAParticipant_is403() throws Exception {
        when(chatService.getMessages(12L, userId, null, null)).thenThrow(new AccessDeniedException("no"));

        mvc.perform(get(BASE + "/12/messages").principal(authentication))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void getMessages_missingConversation_is404() throws Exception {
        when(chatService.getMessages(99L, userId, null, null))
                .thenThrow(new ConversationNotFoundException("Conversación no encontrada."));

        mvc.perform(get(BASE + "/99/messages").principal(authentication))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Conversación no encontrada."));
    }

    @Test
    void getMessages_aBeforeThatIsNotANumber_is400() throws Exception {
        mvc.perform(get(BASE + "/12/messages").param("before", "abc").principal(authentication))
                .andExpect(status().isBadRequest());
    }

    // --- send ---

    @Test
    void sendMessage_new_is201() throws Exception {
        UUID clientMessageId = UUID.randomUUID();
        when(chatService.sendMessage(eq(12L), argThat((ChatMessageCreateRequest request) ->
                "Hola".equals(request.getContent()) && clientMessageId.equals(request.getClientMessageId())
                        && Long.valueOf(87L).equals(request.getJobRequestId())), eq(userId)))
                .thenReturn(new FoundOrCreated<>(message(clientMessageId), true));

        mvc.perform(signedIn(post(BASE + "/12/messages"), """
                        {"content":"Hola","clientMessageId":"%s","jobRequestId":87}""".formatted(clientMessageId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(345))
                .andExpect(jsonPath("$.content").value("Hola"));
    }

    @Test
    void sendMessage_aRetry_is200() throws Exception {
        UUID clientMessageId = UUID.randomUUID();
        when(chatService.sendMessage(eq(12L), any(ChatMessageCreateRequest.class), eq(userId)))
                .thenReturn(new FoundOrCreated<>(message(clientMessageId), false));

        mvc.perform(signedIn(post(BASE + "/12/messages"), """
                        {"content":"Hola","clientMessageId":"%s"}""".formatted(clientMessageId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(345));
    }

    @Test
    void sendMessage_aTypeInTheBodyIsIgnored_itIsAlwaysText() throws Exception {
        UUID clientMessageId = UUID.randomUUID();
        when(chatService.sendMessage(eq(12L), any(ChatMessageCreateRequest.class), eq(userId)))
                .thenReturn(new FoundOrCreated<>(message(clientMessageId), true));

        mvc.perform(signedIn(post(BASE + "/12/messages"), """
                        {"content":"Hola","clientMessageId":"%s","type":"JOB_PROPOSAL"}""".formatted(clientMessageId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("TEXT"));
    }

    @Test
    void sendMessage_withoutContentOrClientMessageId_is400() throws Exception {
        mvc.perform(signedIn(post(BASE + "/12/messages"), """
                        {"content":"   "}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.content").exists())
                .andExpect(jsonPath("$.details.clientMessageId").exists());
        verifyNoInteractions(chatService);
    }

    @Test
    void sendMessage_tooLong_is400WithTheServicesMessage() throws Exception {
        when(chatService.sendMessage(eq(12L), any(ChatMessageCreateRequest.class), eq(userId))).thenThrow(
                new ResponseStatusException(HttpStatus.BAD_REQUEST, "El mensaje no puede superar los 2000 caracteres"));

        mvc.perform(signedIn(post(BASE + "/12/messages"), """
                        {"content":"%s","clientMessageId":"%s"}""".formatted("a".repeat(2001), UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("El mensaje no puede superar los 2000 caracteres"));
    }

    @Test
    void sendMessage_blockedOrNotAParticipant_is403() throws Exception {
        when(chatService.sendMessage(eq(12L), any(ChatMessageCreateRequest.class), eq(userId)))
                .thenThrow(new AccessDeniedException("La conversación está bloqueada"));

        mvc.perform(signedIn(post(BASE + "/12/messages"), """
                        {"content":"Hola","clientMessageId":"%s"}""".formatted(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void sendMessage_pastTheRateLimit_is429() throws Exception {
        when(chatService.sendMessage(eq(12L), any(ChatMessageCreateRequest.class), eq(userId))).thenThrow(
                new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Estás mandando demasiados mensajes, esperá un minuto y probá de nuevo"));

        mvc.perform(signedIn(post(BASE + "/12/messages"), """
                        {"content":"Hola","clientMessageId":"%s"}""".formatted(UUID.randomUUID())))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("Estás mandando demasiados mensajes, esperá un minuto y probá de nuevo"));
    }

    @Test
    void sendMessage_withoutAToken_is401() throws Exception {
        mvc.perform(post(BASE + "/12/messages").contentType(MediaType.APPLICATION_JSON).content("""
                        {"content":"Hola","clientMessageId":"%s"}""".formatted(UUID.randomUUID())))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(chatService);
    }

    // --- read ---

    @Test
    void markRead_is204() throws Exception {
        mvc.perform(signedIn(post(BASE + "/12/read"), """
                        {"lastReadMessageId":345}"""))
                .andExpect(status().isNoContent());
        verify(chatService).markRead(12L, 345L, userId);
    }

    @Test
    void markRead_withoutTheMessage_is400() throws Exception {
        mvc.perform(signedIn(post(BASE + "/12/read"), "{}"))
                .andExpect(status().isBadRequest());
        verify(chatService, never()).markRead(any(), any(), any());
    }

    @Test
    void markRead_notAParticipant_is403() throws Exception {
        doThrow(new AccessDeniedException("no")).when(chatService).markRead(12L, 345L, userId);

        mvc.perform(signedIn(post(BASE + "/12/read"), """
                        {"lastReadMessageId":345}"""))
                .andExpect(status().isForbidden());
    }

    @Test
    void markRead_withoutAToken_is401() throws Exception {
        mvc.perform(post(BASE + "/12/read").contentType(MediaType.APPLICATION_JSON).content("""
                        {"lastReadMessageId":345}"""))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(chatService);
    }
}
