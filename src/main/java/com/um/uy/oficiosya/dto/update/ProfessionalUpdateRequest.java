package com.um.uy.oficiosya.dto.update;

import com.um.uy.oficiosya.validation.annotations.PhoneNumber;
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
}
