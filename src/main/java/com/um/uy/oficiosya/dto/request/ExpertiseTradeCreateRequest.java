package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
public class ExpertiseTradeCreateRequest {
    @NotNull(message = "El oficio es obligatorio")
    private Long tradeId;

    @NotNull(message = "La tarifa mínima es obligatoria")
    @PositiveOrZero(message = "La tarifa mínima no puede ser negativa")
    private BigDecimal minimumHourlyWage;

    @NotNull(message = "La tarifa máxima es obligatoria")
    @PositiveOrZero(message = "La tarifa máxima no puede ser negativa")
    private BigDecimal maximumHourlyWage;
}
