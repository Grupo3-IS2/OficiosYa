package com.um.uy.oficiosya.dto.request;

import com.um.uy.oficiosya.validation.annotations.PhoneNumber;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/** The Google credential plus what a professional has to give that Google doesn't know. */
@EqualsAndHashCode(callSuper = true)
@Data
@SuperBuilder
@NoArgsConstructor
public class GoogleProfessionalRegisterRequest extends GoogleRegisterRequest {
    @NotBlank(message = "El teléfono es obligatorio")
    @PhoneNumber
    private String phoneNumber;

    @NotBlank(message = "La ubicación de trabajo es obligatoria")
    private String workingLocation;

    /** Optional while profiles from before it exist; see {@link ServiceAreaRequest}. */
    @Valid
    private ServiceAreaRequest serviceArea;
}
