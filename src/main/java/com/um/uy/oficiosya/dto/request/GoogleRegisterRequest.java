package com.um.uy.oficiosya.dto.request;

import com.um.uy.oficiosya.validation.annotations.FullName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/** The Google credential, and the name the user wants if it isn't the one on the Google account. */
@EqualsAndHashCode(callSuper = true)
@Data
@SuperBuilder
@NoArgsConstructor
public class GoogleRegisterRequest extends GoogleCredentialRequest {
    @FullName
    @Schema(description = "Opcional: sin él se usa el nombre de la cuenta de Google")
    private String name;
}
