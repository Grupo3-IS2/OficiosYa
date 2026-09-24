package com.um.uy.oficiosya.dto.update;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

/** Links a Google account to the logged-in user's account. */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@ToString(exclude = "currentPassword")
public class GoogleLinkUpdateRequest {
    @NotBlank(message = "La credencial de Google es obligatoria")
    @Schema(description = "El ID token (JWT) que devuelve el botón de Google en el navegador")
    private String credential;

    @NotBlank(message = "La contraseña actual es obligatoria")
    private String currentPassword;
}
