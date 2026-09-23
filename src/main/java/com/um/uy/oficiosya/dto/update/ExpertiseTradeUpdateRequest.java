package com.um.uy.oficiosya.dto.update;

import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/** Partial update (PATCH) of an offered trade's hourly rates: a null field keeps its current value. */
@Data
@NoArgsConstructor
public class ExpertiseTradeUpdateRequest {
    @PositiveOrZero(message = "La tarifa mínima no puede ser negativa")
    private BigDecimal minimumHourlyWage;

    @PositiveOrZero(message = "La tarifa máxima no puede ser negativa")
    private BigDecimal maximumHourlyWage;
}
