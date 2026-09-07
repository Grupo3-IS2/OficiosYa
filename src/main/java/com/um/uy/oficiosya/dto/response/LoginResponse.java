package com.um.uy.oficiosya.dto.response;

import jakarta.validation.constraints.Email;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class LoginResponse {
    /** The entity's publicId, the internal numeric id is not exposed. */
    private UUID id;

    private String token;

    @Email
    private String email;

    private String name;

    private String message;
}
