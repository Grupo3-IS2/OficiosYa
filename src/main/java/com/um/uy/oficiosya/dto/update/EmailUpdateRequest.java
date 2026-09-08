package com.um.uy.oficiosya.dto.update;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class EmailUpdateRequest {
    @NotBlank(message = "Email cannot be empty")
    @Email(message = "Invalid email")
    private String newEmail;
}
