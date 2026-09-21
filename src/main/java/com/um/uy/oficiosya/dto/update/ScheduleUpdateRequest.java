package com.um.uy.oficiosya.dto.update;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
public class ScheduleUpdateRequest {
    private LocalDateTime startTimestamp;
    private LocalDateTime endTimestamp;
}
