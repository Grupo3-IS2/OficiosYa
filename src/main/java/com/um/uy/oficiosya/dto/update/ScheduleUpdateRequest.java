package com.um.uy.oficiosya.dto.update;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/** Partial update (PATCH): a null field keeps its current value. */
@Data
@NoArgsConstructor
public class ScheduleUpdateRequest {
    private OffsetDateTime startTimestamp;
    private OffsetDateTime endTimestamp;
}
