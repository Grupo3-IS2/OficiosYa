package com.um.uy.oficiosya.dto.update;

import com.um.uy.oficiosya.dto.request.ServiceAreaRequest;
import com.um.uy.oficiosya.validation.annotations.PhoneNumber;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@EqualsAndHashCode(callSuper = true)
@Data
@SuperBuilder
@NoArgsConstructor
public class ProfessionalUpdateRequest extends ClientUpdateRequest {
    @PhoneNumber
    private String phoneNumber;

    private String workingLocation;

    /** Replaces the whole area when sent; left out, the current one stays. */
    @Valid
    private ServiceAreaRequest serviceArea;

    @Size(min = 20, max = 500, message = "La descripción debe tener entre 20 y 500 caracteres")
    private String description;
}
