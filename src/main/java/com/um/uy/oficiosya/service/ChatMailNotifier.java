package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Conversation;
import com.um.uy.oficiosya.repository.ConversationRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * "Tenés mensajes sin leer": to each side with messages unread for a while, at most once every
 * {@code CHAT_UNREAD_MAIL_INTERVAL_HOURS} per conversation, never in a blocked one. Without the
 * content: email isn't encrypted.
 */
@Component
public class ChatMailNotifier {

    /** Someone reading right now doesn't get an email about it. */
    static final Duration UNREAD_FOR = Duration.ofMinutes(15);

    private final ConversationRepository conversationRepository;
    private final EmailSenderService emailSender;
    private final Clock clock;
    private final Duration interval;
    private final String siteUrl;

    public ChatMailNotifier(ConversationRepository conversationRepository,
                            EmailSenderService emailSender,
                            Clock clock,
                            @Value("${app.chat.unread-mail-interval-hours}") long intervalHours,
                            @Value("${app.notifications.site-url}") String siteUrl) {
        this.conversationRepository = conversationRepository;
        this.emailSender = emailSender;
        this.clock = clock;
        this.interval = Duration.ofHours(intervalHours);
        this.siteUrl = siteUrl.endsWith("/") ? siteUrl.substring(0, siteUrl.length() - 1) : siteUrl;
    }

    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT5M")
    @Transactional
    public void mailUnread() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime sentBefore = now.minus(UNREAD_FOR);
        OffsetDateTime mailedBefore = now.minus(interval);

        for (Conversation conversation : conversationRepository.findUnreadToMailClientSide(sentBefore, mailedBefore)) {
            mail(conversation.getClient(), conversation.getProfessional(), conversation);
            conversation.setClientUnreadMailAt(now);
        }
        for (Conversation conversation : conversationRepository.findUnreadToMailProfessionalSide(sentBefore, mailedBefore)) {
            mail(conversation.getProfessional(), conversation.getClient(), conversation);
            conversation.setProfessionalUnreadMailAt(now);
        }
    }

    /** With the emails off nothing is sent, but the side still counts as told, so turning them on doesn't bring up old messages. */
    private void mail(Client recipient, Client sender, Conversation conversation) {
        if (!recipient.isEmailNotifications()) {
            return;
        }

        String body = """
                Hola %s,

                Tenés mensajes sin leer de %s en OficiosYa.

                Leelos acá:
                %s/messages/%d

                Si no querés recibir estos avisos, podés desactivarlos en Editar perfil.

                Equipo de OficiosYa
                """.formatted(recipient.getName(), sender.getName(), siteUrl, conversation.getId());
        emailSender.sendNotification(recipient.getEmail(), "Tenés mensajes sin leer de " + sender.getName(), body);
    }
}
