package com.um.uy.oficiosya.dto.update;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PasswordUpdateRequest {
    @NotBlank
    private String oldPassword;

    @NotBlank
    private String newPassword;
}
