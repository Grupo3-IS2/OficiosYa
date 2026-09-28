package com.um.uy.oficiosya.dto.request;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.um.uy.oficiosya.validation.annotations.FullName;
import com.um.uy.oficiosya.validation.annotations.Password;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

import java.util.Locale;

@Data
@SuperBuilder
@NoArgsConstructor
public class UserCreateRequest {
    @NotBlank(message = "El nombre es obligatorio")
    @FullName
    private String name;

    @NotBlank(message = "La contraseña es obligatoria")
    @Password
    @Schema(minLength = 8, description = "Al menos 8 caracteres, con mayúscula, minúscula, número y carácter especial")
    private String password;

    private String email;

    @NotBlank(message = "El email es obligatorio")
    @Email(message = "El email no es válido")
    public String getEmail() {
        return email;
    }

    @JsonSetter("email")
    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
