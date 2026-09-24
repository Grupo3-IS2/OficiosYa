package com.um.uy.oficiosya.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Data
@SuperBuilder
@NoArgsConstructor
public class GoogleCredentialRequest {
    @NotBlank(message = "La credencial de Google es obligatoria")
    @Schema(description = "El ID token (JWT) que devuelve el botón de Google en el navegador")
    private String credential;
}
