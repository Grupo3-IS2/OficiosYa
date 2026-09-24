package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;
import lombok.experimental.SuperBuilder;

/** The user's confirmation to linking Google to the account that already has this email. */
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true, exclude = "password")
@Data
@SuperBuilder
@NoArgsConstructor
public class GoogleLinkRequest extends GoogleCredentialRequest {
    @NotBlank(message = "La contraseña es obligatoria")
    private String password;
}
