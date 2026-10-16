package com.um.uy.oficiosya.service;

import java.util.Set;
import java.util.UUID;

/** What a change to a job request tells the rest of the app, once it is saved. */
public final class JobRequestEvents {

    private JobRequestEvents() {
    }

    /** One side asked to move an accepted job: the other side is told. */
    public record RescheduleRequested(Long jobRequestId) {
    }

    /** What waits for these users' answer may have grown or shrunk. */
    public record AwaitingAnswersChanged(Set<UUID> userIds) {
    }
}
