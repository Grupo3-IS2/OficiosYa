package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.Role;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatParticipantResponse {
    private UUID id;
    private String name;
    private String profileImageUrl;
    /** The role they had when the conversation was created (CLIENT or PROFESSIONAL). */
    private Role role;
}
