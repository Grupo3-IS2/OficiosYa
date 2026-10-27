package com.um.uy.oficiosya.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

/**
 * Sends the request emails once the change that triggers them is saved (never for one that is rolled
 * back), and on its own thread: the user doesn't wait for the mail server, and a failure there doesn't
 * undo what they did.
 */
@Component
@Slf4j
public class RequestNotificationListener {

    private final RequestNotificationService notifications;

    public RequestNotificationListener(RequestNotificationService notifications) {
        this.notifications = notifications;
    }

    @Async
    @TransactionalEventListener
    public void onRescheduleRequested(JobRequestEvents.RescheduleRequested event) {
        try {
            notifications.notifyRescheduleRequested(event.jobRequestId());
        } catch (RuntimeException e) {
            log.error("Could not notify the reschedule of job request {}", event.jobRequestId(), e);
        }
    }

    @Async
    @TransactionalEventListener
    public void onJobProposed(JobRequestEvents.JobProposed event) {
        notifyJobChanged(event.jobRequestId(), null, null);
    }

    @Async
    @TransactionalEventListener
    public void onJobStatusChanged(JobRequestEvents.JobStatusChanged event) {
        notifyJobChanged(event.jobRequestId(), event.change(), event.actorId());
    }

    private void notifyJobChanged(Long jobRequestId, JobRequestEvents.Change change, UUID actorId) {
        try {
            notifications.notifyJobChanged(jobRequestId, change, actorId);
        } catch (RuntimeException e) {
            log.error("Could not notify the change of job request {}", jobRequestId, e);
        }
    }

    @Async
    @TransactionalEventListener
    public void onAwaitingAnswersChanged(JobRequestEvents.AwaitingAnswersChanged event) {
        for (UUID userId : event.userIds()) {
            try {
                notifications.refreshAwaitingAnswerAlert(userId);
            } catch (RuntimeException e) {
                log.error("Could not refresh the awaiting-answer alert of user {}", userId, e);
            }
        }
    }
}
