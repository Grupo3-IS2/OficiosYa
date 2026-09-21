package com.um.uy.oficiosya.dto.request;

import com.um.uy.oficiosya.entity.ScheduleType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
public class ScheduleCreateRequest {
    @NotNull(message = "El tipo de bloque es obligatorio")
    private ScheduleType type;

    @NotNull(message = "El inicio del bloque es obligatorio")
    private LocalDateTime startTimestamp;

    @NotNull(message = "El fin del bloque es obligatorio")
    private LocalDateTime endTimestamp;
}
