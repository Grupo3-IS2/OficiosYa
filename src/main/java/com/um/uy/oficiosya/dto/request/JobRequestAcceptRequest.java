package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Data
@NoArgsConstructor
public class JobRequestAcceptRequest {
    @NotNull(message = "El inicio del bloque es obligatorio")
    private OffsetDateTime startTimestamp;

    @NotNull(message = "El fin del bloque es obligatorio")
    private OffsetDateTime endTimestamp;
}
