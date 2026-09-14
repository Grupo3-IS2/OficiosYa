package com.um.uy.oficiosya.dto.request;

import com.um.uy.oficiosya.validation.annotations.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@EqualsAndHashCode(callSuper = true)
@Data
@SuperBuilder
@NoArgsConstructor
public class ProfessionalCreateRequest extends UserCreateRequest {
    @NotBlank(message = "El teléfono es obligatorio")
    @PhoneNumber
    private String phoneNumber;

    @NotBlank(message = "La ubicación de trabajo es obligatoria")
    private String workingLocation;
}
