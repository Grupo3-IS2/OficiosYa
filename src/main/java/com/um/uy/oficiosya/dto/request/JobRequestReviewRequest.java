package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Same 1-10 scale as the professional's rating, which is the average of these. */
@Data
@NoArgsConstructor
public class JobRequestReviewRequest {
    @NotNull(message = "La calificación es obligatoria")
    @Min(value = 1, message = "La calificación debe estar entre 1 y 10")
    @Max(value = 10, message = "La calificación debe estar entre 1 y 10")
    private Integer rating;

    @Size(max = 1000, message = "La reseña no puede superar los 1000 caracteres")
    private String review;
}
