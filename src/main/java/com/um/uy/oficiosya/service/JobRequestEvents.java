package com.um.uy.oficiosya.service;

import java.util.Set;
import java.util.UUID;

/** What a change to a job request tells the rest of the app, once it is saved. */
public final class JobRequestEvents {

    private JobRequestEvents() {
    }

    /** A job was just proposed, by either side; still inside its transaction, so its chat card is saved with it. */
    public record JobProposed(Long jobRequestId) {
    }

    /** The job's status or timeframe changed. {@code actorId} is who did it; null when it expired on its own. */
    public record JobStatusChanged(Long jobRequestId, Change change, UUID actorId) {
    }

    public enum Change {
        ACCEPTED, REJECTED, CANCELLED, RESCHEDULE_REQUESTED, RESCHEDULE_ACCEPTED, RESCHEDULE_REJECTED, COMPLETED, EXPIRED
    }

    /** One side asked to move an accepted job: the other side is told. */
    public record RescheduleRequested(Long jobRequestId) {
    }

    /** What waits for these users' answer may have grown or shrunk. */
    public record AwaitingAnswersChanged(Set<UUID> userIds) {
    }
}
