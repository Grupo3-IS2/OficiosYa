package com.um.uy.oficiosya.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
public class JobRequestCreateRequest {
    @NotNull(message = "El profesional es obligatorio")
    private UUID professionalId;

    @NotBlank(message = "La ubicación es obligatoria")
    private String location;

    @NotNull(message = "El monto a pagar es obligatorio")
    @PositiveOrZero(message = "El monto a pagar no puede ser negativo")
    private BigDecimal paymentAmount;

    @NotEmpty(message = "Debés incluir al menos una tarea")
    @Valid
    private List<TaskCreateRequest> tasks;
}
