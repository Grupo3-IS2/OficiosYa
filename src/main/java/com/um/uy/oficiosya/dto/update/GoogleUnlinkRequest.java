package com.um.uy.oficiosya.dto.update;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@ToString(exclude = "currentPassword")
public class GoogleUnlinkRequest {
    @NotBlank(message = "La contraseña actual es obligatoria")
    private String currentPassword;
}
