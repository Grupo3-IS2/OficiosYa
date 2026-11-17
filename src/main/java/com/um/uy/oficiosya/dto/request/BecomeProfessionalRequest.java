package com.um.uy.oficiosya.dto.request;

import com.um.uy.oficiosya.validation.annotations.PhoneNumber;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** What a client adds to offer services: the same contact data a professional registers with. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BecomeProfessionalRequest {
    @NotBlank(message = "El teléfono es obligatorio")
    @PhoneNumber
    private String phoneNumber;

    @NotBlank(message = "La ubicación de trabajo es obligatoria")
    private String workingLocation;

    /** Optional, as on registration: without it the profile doesn't show up in searches by distance. */
    @Valid
    private ServiceAreaRequest serviceArea;
}
