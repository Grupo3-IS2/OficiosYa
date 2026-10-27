package com.um.uy.oficiosya.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
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

    /** Required when a professional proposes; optional for a client, as the timeframe they'd like, which the professional confirms or changes. */
    private OffsetDateTime startTimestamp;
    private OffsetDateTime endTimestamp;

    @NotBlank(message = "La ubicación es obligatoria")
    private String location;

    /**
     * Where the job is, when chosen on the map (both or neither): it tells whether the professional's
     * service area reaches it. Uruguay's bounds, like {@link ServiceAreaRequest}.
     */
    @DecimalMin(value = "-35.2", message = "La ubicación tiene que estar en Uruguay")
    @DecimalMax(value = "-29.9", message = "La ubicación tiene que estar en Uruguay")
    private Double latitude;

    @DecimalMin(value = "-58.7", message = "La ubicación tiene que estar en Uruguay")
    @DecimalMax(value = "-52.9", message = "La ubicación tiene que estar en Uruguay")
    private Double longitude;

    @NotNull(message = "El monto a pagar es obligatorio")
    @PositiveOrZero(message = "El monto a pagar no puede ser negativo")
    private BigDecimal paymentAmount;

    @NotEmpty(message = "Debés incluir al menos una tarea")
    @Valid
    private List<TaskCreateRequest> tasks;
}
