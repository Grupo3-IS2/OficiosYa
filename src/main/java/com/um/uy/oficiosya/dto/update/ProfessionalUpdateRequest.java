package com.um.uy.oficiosya.dto.update;

import com.um.uy.oficiosya.validation.annotations.PhoneNumber;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@EqualsAndHashCode(callSuper = true)
@Data
@SuperBuilder
@NoArgsConstructor
public class ProfessionalUpdateRequest extends UserUpdateRequest {
    @PhoneNumber
    private String phoneNumber;

    private String workingLocation;

    @Size(min = 20, max = 500, message = "La descripción debe tener entre 20 y 500 caracteres")
    private String description;
}
