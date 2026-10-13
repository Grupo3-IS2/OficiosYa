package com.um.uy.oficiosya.dto.update;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class NotificationsUpdateRequest {
    @NotNull(message = "Indicá si querés recibir avisos por correo")
    private Boolean emailNotifications;
}
