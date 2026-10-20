package com.um.uy.oficiosya.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Exactly one of professionalId or clientId: the caller proposes the job as a client to that
 * professional, or as a professional to that client, with the timeframe they offer.
 */
@Data
@NoArgsConstructor
public class JobRequestCreateRequest {
    private UUID professionalId;

    private UUID clientId;

    /** Only when a professional proposes (with clientId); a client's proposal gets its timeframe when accepted. */
    private OffsetDateTime startTimestamp;
    private OffsetDateTime endTimestamp;

    @NotBlank(message = "La ubicación es obligatoria")
    private String location;

    @NotNull(message = "El monto a pagar es obligatorio")
    @PositiveOrZero(message = "El monto a pagar no puede ser negativo")
    private BigDecimal paymentAmount;

    @NotEmpty(message = "Debés incluir al menos una tarea")
    @Valid
    private List<TaskCreateRequest> tasks;
}
