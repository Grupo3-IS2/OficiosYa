package com.um.uy.oficiosya.dto.update;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Data
@SuperBuilder
@NoArgsConstructor
public class UserUpdateRequest {
    @Size(min = 1, max = 100, message = "Name cannot be empty")
    private String name;

    private String profileImageUrl;
}
