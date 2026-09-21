package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.ScheduleType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScheduleResponse {
    private Long id;
    private UUID professionalId;
    private Long jobRequestId;
    private ScheduleType type;
    private LocalDateTime startTimestamp;
    private LocalDateTime endTimestamp;
}
