package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.Role;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * What every user has, whatever they are. A client is described by this alone;
 * a professional answers with {@link ProfessionalResponse}, which adds its own fields.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {
    /** The entity's publicId, the internal numeric id is not exposed. */
    private UUID id;
    private String name;
    private String email;
    private String profileImageUrl;
    private Role role;
    private LocalDateTime createdAt;

    /** False for an account created with Google: it has no password to change or to confirm with. */
    private boolean hasPassword;

    /** Whether a Google account is linked, so the user can sign in with it. */
    private boolean googleLinked;
}
