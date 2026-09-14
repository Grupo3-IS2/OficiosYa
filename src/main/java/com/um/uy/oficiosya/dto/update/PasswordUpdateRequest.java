package com.um.uy.oficiosya.dto.update;

import com.um.uy.oficiosya.validation.annotations.Password;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PasswordUpdateRequest {
    @NotBlank(message = "La contraseña actual es obligatoria")
    private String oldPassword;

    @NotBlank(message = "La nueva contraseña es obligatoria")
    @Password
    private String newPassword;

    @NotBlank(message = "La confirmación de la contraseña es obligatoria")
    private String newPasswordConfirmation;
}
