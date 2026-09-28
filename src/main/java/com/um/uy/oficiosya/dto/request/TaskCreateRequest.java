package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class TaskCreateRequest {
    @NotNull(message = "El oficio de la tarea es obligatorio")
    private Long tradeId;

    @NotBlank(message = "La descripción de la tarea es obligatoria")
    private String description;
}
