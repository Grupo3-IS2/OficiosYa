package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.Role;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/** A conversation as the caller sees it. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ConversationResponse {
    private Long id;
    private ChatParticipantResponse otherParticipant;
    /** The caller's role when the conversation was created; informative only. */
    private Role myRole;
    private String lastMessagePreview;
    private OffsetDateTime lastMessageAt;
    private long unreadCount;
    /** False if either side blocked it. */
    private boolean canWrite;
    /** Whether the block is the caller's own; a block by the other side only shows as canWrite=false. */
    private boolean blockedByMe;
}
