package com.um.uy.oficiosya.dto.request;

import com.um.uy.oficiosya.validation.annotations.FullName;
import com.um.uy.oficiosya.validation.annotations.Password;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Data
@SuperBuilder
@NoArgsConstructor
public class UserCreateRequest {
    @NotBlank(message = "El nombre es obligatorio")
    @FullName
    private String name;

    @NotBlank(message = "La contraseña es obligatoria")
    @Password
    private String password;

    @NotBlank(message = "El email es obligatorio")
    @Email(message = "El email no es válido")
    private String email;
}
