package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Where a professional works from and how far they go. Optional as a whole, but complete when sent: a
 * point without a radius (or the other way round) can't say who they reach. The bounds are Uruguay's,
 * with a small margin, so a point anywhere else is rejected.
 */
public record ServiceAreaRequest(
        @NotNull(message = "Falta la latitud de la zona")
        @DecimalMin(value = "-35.2", message = "La zona tiene que estar en Uruguay")
        @DecimalMax(value = "-29.9", message = "La zona tiene que estar en Uruguay")
        Double latitude,

        @NotNull(message = "Falta la longitud de la zona")
        @DecimalMin(value = "-58.7", message = "La zona tiene que estar en Uruguay")
        @DecimalMax(value = "-52.9", message = "La zona tiene que estar en Uruguay")
        Double longitude,

        @NotNull(message = "Falta el radio de la zona")
        @Min(value = 1, message = "El radio tiene que ser de 1 a 800 km")
        @Max(value = 800, message = "El radio tiene que ser de 1 a 800 km")
        Integer radiusKm
) {
}
