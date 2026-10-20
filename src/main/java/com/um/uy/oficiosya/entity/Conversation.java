package com.um.uy.oficiosya.entity;

import com.um.uy.oficiosya.config.ChatContentConverter;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicUpdate;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Both sides write to this row all the time (a message, a "read" on every message that arrives), so
 * there is no @Version: those writes are single UPDATEs in ConversationRepository that can't undo each
 * other, instead of read-modify-save. @DynamicUpdate keeps any other save to the columns it changed,
 * so it doesn't write back a stale lastMessageAt or read position either.
 */
@Entity
@DynamicUpdate
@Getter
@Setter
@Table(name = "conversation", schema = "chat",
        uniqueConstraints = @UniqueConstraint(name = "uk_conversation_pair", columnNames = {"client_id", "professional_id"}),
        indexes = {
                @Index(name = "idx_conversation_client_last_message", columnList = "client_id, last_message_at desc"),
                @Index(name = "idx_conversation_professional_last_message", columnList = "professional_id, last_message_at desc")
        })
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Conversation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "professional_id", nullable = false)
    private Professional professional;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    /** Null until the first message; the inbox is sorted by it. */
    private OffsetDateTime lastMessageAt;

    /** The start of the last message, for the inbox. Encrypted like the messages themselves. */
    @Convert(converter = ChatContentConverter.class)
    @Column(columnDefinition = "text")
    private String lastMessagePreview;

    /** Up to which message each side has read (null: none). Only for the unread count, never shown to the other side. */
    private Long clientLastReadMessageId;
    private Long professionalLastReadMessageId;

    /** When each side blocked the conversation; null if they didn't. */
    private OffsetDateTime clientBlockedAt;
    private OffsetDateTime professionalBlockedAt;

    /** The last "unread messages" email sent to each side, to space them out. */
    private OffsetDateTime clientUnreadMailAt;
    private OffsetDateTime professionalUnreadMailAt;

    public boolean hasParticipant(UUID userId) {
        return isClientSide(userId) || professional.getPublicId().equals(userId);
    }

    /** Whether the user is the one who had the client role when it was created. */
    public boolean isClientSide(UUID userId) {
        return client.getPublicId().equals(userId);
    }

    public Client otherParticipant(UUID userId) {
        return isClientSide(userId) ? professional : client;
    }

    public Long lastReadMessageIdOf(UUID userId) {
        return isClientSide(userId) ? clientLastReadMessageId : professionalLastReadMessageId;
    }

    public boolean isBlocked() {
        return clientBlockedAt != null || professionalBlockedAt != null;
    }

    public boolean isBlockedBy(UUID userId) {
        return (isClientSide(userId) ? clientBlockedAt : professionalBlockedAt) != null;
    }
}
