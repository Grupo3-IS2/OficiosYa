package com.um.uy.oficiosya.dto.request;

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
    @NotBlank
    private String phoneNumber;

    @NotBlank
    private String workingLocation;
}
