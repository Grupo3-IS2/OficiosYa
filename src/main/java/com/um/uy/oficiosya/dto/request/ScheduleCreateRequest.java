package com.um.uy.oficiosya.dto.request;

import com.um.uy.oficiosya.entity.ScheduleType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@NoArgsConstructor
public class ScheduleCreateRequest {
    @NotNull(message = "Schedule block type is required")
    private ScheduleType type;

    @NotNull(message = "Schedule start timestamp is required")
    private OffsetDateTime startTimestamp;

    @NotNull(message = "Schedule end timestamp is required")
    private OffsetDateTime endTimestamp;

    /** Optional RFC 5545 recurrence rule (e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10). */
    private String rrule;

    /** Optional RFC 5545 time zone identifier (e.g. America/Montevideo). */
    private String tzid;

    /** Optional RFC 5545 exception timestamps excluded from recurrence expansion. */
    private List<OffsetDateTime> exdates;
}
