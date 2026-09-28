package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.ScheduleType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScheduleResponse {
    private Long id;
    private UUID professionalId;
    private Long jobRequestId;
    private ScheduleType type;
    private OffsetDateTime startTimestamp;
    private OffsetDateTime endTimestamp;
}
