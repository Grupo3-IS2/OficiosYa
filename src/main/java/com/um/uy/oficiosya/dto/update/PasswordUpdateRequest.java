package com.um.uy.oficiosya.dto.update;

import com.um.uy.oficiosya.validation.annotations.Password;
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
    @Password
    private String newPassword;

    @NotBlank
    private String newPasswordConfirmation;
}
