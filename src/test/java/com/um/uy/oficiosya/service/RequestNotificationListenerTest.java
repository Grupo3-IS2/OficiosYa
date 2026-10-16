package com.um.uy.oficiosya.service;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/** Each event reaches its email, and a failing email never escapes the listener. */
class RequestNotificationListenerTest {

    private final RequestNotificationService notifications = mock(RequestNotificationService.class);
    private final RequestNotificationListener listener = new RequestNotificationListener(notifications);

    @Test
    void aProposedJob_isNotifiedAsNew() {
        listener.onJobProposed(new JobRequestEvents.JobProposed(1L));

        verify(notifications).notifyJobChanged(1L, null, null);
    }

    @Test
    void aStatusChange_isNotifiedWithWhoMadeIt() {
        UUID actor = UUID.randomUUID();

        listener.onJobStatusChanged(new JobRequestEvents.JobStatusChanged(1L, JobRequestEvents.Change.ACCEPTED, actor));

        verify(notifications).notifyJobChanged(1L, JobRequestEvents.Change.ACCEPTED, actor);
    }

    @Test
    void aRescheduleAskedFor_isNotified() {
        listener.onRescheduleRequested(new JobRequestEvents.RescheduleRequested(1L));

        verify(notifications).notifyRescheduleRequested(1L);
    }

    @Test
    void everyUserWhosePileChanged_getsTheirAlertRefreshed_evenIfOneFails() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        doThrow(new IllegalStateException("mail down")).when(notifications).refreshAwaitingAnswerAlert(first);

        listener.onAwaitingAnswersChanged(new JobRequestEvents.AwaitingAnswersChanged(new LinkedHashSet<>(List.of(first, second))));

        verify(notifications).refreshAwaitingAnswerAlert(second);
    }

    @Test
    void aFailingEmail_isLoggedAndSwallowed() {
        doThrow(new IllegalStateException("mail down")).when(notifications).notifyJobChanged(any(), any(), any());
        doThrow(new IllegalStateException("mail down")).when(notifications).notifyRescheduleRequested(any());

        assertDoesNotThrow(() -> {
            listener.onJobProposed(new JobRequestEvents.JobProposed(1L));
            listener.onRescheduleRequested(new JobRequestEvents.RescheduleRequested(1L));
        });
    }
}
