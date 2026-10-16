package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.response.ChatJobSummary;
import com.um.uy.oficiosya.dto.response.ChatMessageResponse;
import com.um.uy.oficiosya.service.interfaces.ChatService;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** What reaches each user's queues once a change is committed. */
class ChatPushListenerTest {

    private final SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
    private final ChatService chatService = mock(ChatService.class);
    private final ChatPushListener listener = new ChatPushListener(template, chatService);

    private final UUID ana = UUID.randomUUID();
    private final UUID beto = UUID.randomUUID();

    @Test
    void aMessage_goesToBothParticipants_byTheirPublicId() {
        ChatMessageResponse message = new ChatMessageResponse();

        listener.onMessageSent(new ChatMessageSent(message, Set.of(ana, beto)));

        verify(template).convertAndSendToUser(ana.toString(), "/queue/messages", message);
        verify(template).convertAndSendToUser(beto.toString(), "/queue/messages", message);
    }

    @Test
    void aFailedPushToOne_doesntStopTheOther() {
        ChatMessageResponse message = new ChatMessageResponse();
        doThrow(new MessageDeliveryException("down")).when(template)
                .convertAndSendToUser(eq(ana.toString()), any(), any(Object.class));

        assertDoesNotThrow(() -> listener.onMessageSent(new ChatMessageSent(message, Set.of(ana, beto))));
        verify(template).convertAndSendToUser(beto.toString(), "/queue/messages", message);
    }

    @Test
    void aJobChange_sendsTheCardAsItIsNowToBoth() {
        ChatJobSummary job = new ChatJobSummary();
        when(chatService.getJobUpdate(87L)).thenReturn(Optional.of(new ChatService.JobUpdate(12L, job, Set.of(ana, beto))));

        listener.onJobStatusChanged(new JobRequestEvents.JobStatusChanged(87L, JobRequestEvents.Change.ACCEPTED, ana));

        ChatPushListener.JobUpdatePush payload = new ChatPushListener.JobUpdatePush(12L, job);
        verify(template).convertAndSendToUser(ana.toString(), "/queue/job-updates", payload);
        verify(template).convertAndSendToUser(beto.toString(), "/queue/job-updates", payload);
    }

    @Test
    void aJobThatNoLongerExists_pushesNothing() {
        when(chatService.getJobUpdate(87L)).thenReturn(Optional.empty());

        listener.onJobStatusChanged(new JobRequestEvents.JobStatusChanged(87L, JobRequestEvents.Change.ACCEPTED, ana));

        verifyNoInteractions(template);
    }
}
