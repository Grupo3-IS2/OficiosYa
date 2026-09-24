package com.um.uy.oficiosya.dto.request;

import com.fasterxml.jackson.annotation.JsonSetter;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Locale;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class VerifyEmailRequest {
    private String email;

    @NotBlank(message = "El código es obligatorio")
    @Pattern(regexp = "\\d+", message = "El código solo tiene números")
    @Size(max = 10, message = "El código no es válido")
    private String code;

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
