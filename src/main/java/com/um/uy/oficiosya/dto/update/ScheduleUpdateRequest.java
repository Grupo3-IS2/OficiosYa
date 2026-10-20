package com.um.uy.oficiosya.dto.update;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;

/** Partial update (PATCH): a null field keeps its current value. */
@Data
@NoArgsConstructor
public class ScheduleUpdateRequest {
    private OffsetDateTime startTimestamp;
    private OffsetDateTime endTimestamp;
    private String rrule;
    private String tzid;
    private List<OffsetDateTime> exdates;
}
