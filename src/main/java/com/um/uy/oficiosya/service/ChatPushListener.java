package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.response.ChatJobSummary;
import com.um.uy.oficiosya.service.interfaces.ChatService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

/**
 * Pushes to both sides over STOMP, only once the change is committed: never a message that ended up
 * rolled back. Best effort: whoever isn't connected gets it from the REST API when they come back.
 * The user destinations are keyed by publicId, the principal's name.
 */
@Component
@Slf4j
public class ChatPushListener {

    static final String MESSAGES = "/queue/messages";
    static final String JOB_UPDATES = "/queue/job-updates";

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatService chatService;

    public ChatPushListener(SimpMessagingTemplate messagingTemplate, ChatService chatService) {
        this.messagingTemplate = messagingTemplate;
        this.chatService = chatService;
    }

    /** Also to the sender, so their other tabs show it too. */
    @TransactionalEventListener
    public void onMessageSent(ChatMessageSent event) {
        for (UUID userId : event.recipientIds()) {
            send(userId, MESSAGES, event.message());
        }
    }

    /** The card is updated in place: no new message, and the conversation doesn't move up the inbox. */
    @Async
    @TransactionalEventListener
    public void onJobStatusChanged(JobRequestEvents.JobStatusChanged event) {
        chatService.getJobUpdate(event.jobRequestId()).ifPresent(update -> {
            JobUpdatePush payload = new JobUpdatePush(update.conversationId(), update.job());
            for (UUID userId : update.recipientIds()) {
                send(userId, JOB_UPDATES, payload);
            }
        });
    }

    private void send(UUID userId, String destination, Object payload) {
        try {
            messagingTemplate.convertAndSendToUser(userId.toString(), destination, payload);
        } catch (MessagingException e) {
            // Never the payload: it carries the message's text
            log.error("Could not push to {} of user {}", destination, userId, e);
        }
    }

    /** What /user/queue/job-updates receives. */
    public record JobUpdatePush(Long conversationId, ChatJobSummary job) {
    }
}
