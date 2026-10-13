package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, Long> {

    /**
     * The conversation between two users, whichever role each had when it was created: a professional
     * can hire another, so A writing to B and B later asking A for a job must land in the same thread.
     */
    default Optional<Conversation> findBetween(Long userId, Long otherUserId) {
        return findAllBetween(userId, otherUserId).stream().findFirst();
    }

    @Query("""
            SELECT c FROM Conversation c
            WHERE (c.client.id = :userId AND c.professional.id = :otherUserId)
            OR (c.client.id = :otherUserId AND c.professional.id = :userId)
            ORDER BY c.id
            """)
    List<Conversation> findAllBetween(@Param("userId") Long userId, @Param("otherUserId") Long otherUserId);

    /**
     * Creates the pair's conversation unless it already exists; returns 1 if it did, 0 if someone else
     * just did. A plain save would hit the unique constraint on a race instead, and that exception
     * leaves the whole transaction marked for rollback, with no way to go back and fetch the winner.
     */
    @Modifying
    @Query(nativeQuery = true, value = """
            INSERT INTO chat.conversation (client_id, professional_id, created_at)
            VALUES (:clientId, :professionalId, now())
            ON CONFLICT (client_id, professional_id) DO NOTHING
            """)
    int insertIfAbsent(@Param("clientId") Long clientId, @Param("professionalId") Long professionalId);

    /**
     * Moves the conversation up the inbox with its new last message. A message stored a moment earlier
     * whose transaction commits later doesn't overwrite a newer one.
     */
    @Modifying(flushAutomatically = true)
    @Query("""
            UPDATE Conversation c
            SET c.lastMessageAt = :sentAt, c.lastMessagePreview = :preview
            WHERE c.id = :conversationId
            AND (c.lastMessageAt IS NULL OR c.lastMessageAt <= :sentAt)
            """)
    void updateLastMessage(@Param("conversationId") Long conversationId,
                           @Param("sentAt") OffsetDateTime sentAt,
                           @Param("preview") String preview);

    /** Marks the client side read up to that message, only if it's further than what it had. */
    @Modifying(flushAutomatically = true)
    @Query("""
            UPDATE Conversation c SET c.clientLastReadMessageId = :messageId
            WHERE c.id = :conversationId
            AND (c.clientLastReadMessageId IS NULL OR c.clientLastReadMessageId < :messageId)
            """)
    void markReadByClient(@Param("conversationId") Long conversationId, @Param("messageId") Long messageId);

    /** Same as {@link #markReadByClient}, for the professional side. */
    @Modifying(flushAutomatically = true)
    @Query("""
            UPDATE Conversation c SET c.professionalLastReadMessageId = :messageId
            WHERE c.id = :conversationId
            AND (c.professionalLastReadMessageId IS NULL OR c.professionalLastReadMessageId < :messageId)
            """)
    void markReadByProfessional(@Param("conversationId") Long conversationId, @Param("messageId") Long messageId);

    /**
     * The user's inbox, on either side, most recent first. Conversations nobody wrote in yet are left
     * out, so opening a chat "just to look" doesn't show up on the other side.
     */
    @Query("""
            SELECT c FROM Conversation c
            JOIN FETCH c.client
            JOIN FETCH c.professional
            WHERE (c.client.publicId = :userId OR c.professional.publicId = :userId)
            AND c.lastMessageAt IS NOT NULL
            ORDER BY c.lastMessageAt DESC, c.id DESC
            """)
    List<Conversation> findInbox(@Param("userId") UUID userId);
}
