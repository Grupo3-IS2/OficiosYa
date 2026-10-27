package com.um.uy.oficiosya.dto.request;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.um.uy.oficiosya.validation.annotations.Password;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Locale;

/** A forgotten password's replacement, with the code mailed to the account's email. */
@Data
@Builder
// Jackson must not build this from the all-args constructor: it would skip the setter that trims and lowercases the email.
@AllArgsConstructor(onConstructor_ = @JsonCreator(mode = JsonCreator.Mode.DISABLED))
@NoArgsConstructor
public class PasswordResetRequest {
    private String email;

    @NotBlank(message = "El código es obligatorio")
    @Pattern(regexp = "\\d+", message = "El código solo tiene números")
    @Size(max = 10, message = "El código no es válido")
    private String code;

    @NotBlank(message = "La nueva contraseña es obligatoria")
    @Password
    @Schema(minLength = 15, maxLength = 128, description = "Entre 15 y 128 caracteres, que no sea una contraseña común o filtrada")
    private String newPassword;

    @NotBlank(message = "La confirmación de la contraseña es obligatoria")
    private String newPasswordConfirmation;

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
