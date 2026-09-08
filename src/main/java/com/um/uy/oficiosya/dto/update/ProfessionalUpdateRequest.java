package com.um.uy.oficiosya.dto.update;

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
    @Size(min = 1, max = 30, message = "Phone number cannot be empty")
    private String phoneNumber;

    @Size(min = 1, max = 100, message = "Working location cannot be empty")
    private String workingLocation;
}
