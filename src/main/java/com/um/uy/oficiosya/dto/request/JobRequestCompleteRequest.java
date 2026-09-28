package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class JobRequestCompleteRequest {
    @NotBlank(message = "El PIN es obligatorio")
    private String pin;
}
