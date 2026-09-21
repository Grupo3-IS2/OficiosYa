package com.um.uy.oficiosya.dto.update;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ProfessionalRatingUpdateRequest {
    @NotNull(message = "El rating es obligatorio")
    @Min(value = 0, message = "El rating no puede ser menor a 0")
    @Max(value = 10, message = "El rating no puede ser mayor a 10")
    private Double rating;
}
