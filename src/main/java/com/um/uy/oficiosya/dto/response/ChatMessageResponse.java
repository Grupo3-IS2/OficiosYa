package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.ChatMessageType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessageResponse {
    private Long id;
    private Long conversationId;
    private ChatMessageType type;
    private UUID senderId;
    /** Null on a JOB_PROPOSAL. */
    private String content;
    private UUID clientMessageId;
    private Long jobRequestId;
    /** The job as it is now, on a JOB_PROPOSAL; null on a TEXT message. */
    private ChatJobSummary job;
    private OffsetDateTime createdAt;
}
