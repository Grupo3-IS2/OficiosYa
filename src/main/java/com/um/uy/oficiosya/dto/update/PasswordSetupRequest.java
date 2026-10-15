package com.um.uy.oficiosya.dto.update;

import com.um.uy.oficiosya.validation.annotations.Password;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** The first password of an account created with Google, with the code mailed to prove it is its owner. */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PasswordSetupRequest {
    @Schema(description = "El código enviado al correo de la cuenta (no hace falta si la verificación por correo está apagada)")
    private String code;
    @NotBlank(message = "La nueva contraseña es obligatoria")
    @Password
    @Schema(minLength = 8, description = "Al menos 8 caracteres, con mayúscula, minúscula, número y carácter especial")
    private String newPassword;
    @NotBlank(message = "La confirmación de la contraseña es obligatoria")
    private String newPasswordConfirmation;
}
