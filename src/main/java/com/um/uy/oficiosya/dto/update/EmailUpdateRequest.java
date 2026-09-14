package com.um.uy.oficiosya.dto.update;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class EmailUpdateRequest {
    @NotBlank(message = "El nuevo email es obligatorio")
    @Email(message = "El email no es válido")
    private String newEmail;

    @NotBlank(message = "La contraseña actual es obligatoria")
    private String currentPassword;
}
