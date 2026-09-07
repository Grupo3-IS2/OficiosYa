package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.Email;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Data
@SuperBuilder
@NoArgsConstructor
public class UserCreateRequest {
    private String name;

    private String password;

    @Email
    private String email;
}
