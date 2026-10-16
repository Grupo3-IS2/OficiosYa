package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/** The new timeframe the client proposes for an accepted job. */
@Data
@NoArgsConstructor
public class JobRequestRescheduleRequest {
    @NotNull(message = "El nuevo inicio es obligatorio")
    private OffsetDateTime startTimestamp;

    @NotNull(message = "El nuevo fin es obligatorio")
    private OffsetDateTime endTimestamp;
}
