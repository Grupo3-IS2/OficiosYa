package com.um.uy.oficiosya.dto.update;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Confirms deleting the account: the current password, or for an account created with Google (which
 * has none) its email written out, and the code mailed to the account, so a session left open is not
 * enough to delete it.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class AccountDeletionRequest {
    @Schema(description = "La contraseña actual (cuentas con contraseña)")
    private String currentPassword;
    @Schema(description = "El correo de la cuenta escrito a mano (cuentas creadas con Google)")
    private String email;
    @Schema(description = "El código enviado al correo de la cuenta (no hace falta si la verificación por correo está apagada)")
    private String code;
}
