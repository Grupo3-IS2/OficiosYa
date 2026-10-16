package com.um.uy.oficiosya.entity;

public enum JobStatus {
    PROPOSED,
    ACCEPTED,
    RESCHEDULE_REQUESTED,
    REJECTED,
    CANCELLED,
    COMPLETED,
    /** A proposal nobody answered in time, or whose proposed timeframe already went by. Final, like REJECTED. */
    EXPIRED
}
