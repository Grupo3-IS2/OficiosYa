package com.um.uy.oficiosya.dto.update;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** Partial update (PATCH): a null field keeps its current value. */
@Data
@NoArgsConstructor
public class ScheduleUpdateRequest {
    private LocalDateTime startTimestamp;
    private LocalDateTime endTimestamp;
}
