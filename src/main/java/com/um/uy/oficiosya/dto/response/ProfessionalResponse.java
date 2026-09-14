package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.Role;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProfessionalResponse {
    /** The entity's publicId, the internal numeric id is not exposed. */
    private UUID id;
    private String name;
    private String email;
    private String phoneNumber;
    private String profileImageUrl;
    private Role role;
    private LocalDateTime createdAt;
}
