package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    /** A page of the conversation's history, newest first, older than {@code beforeId} if given. */
    @Query("""
            SELECT m FROM ChatMessage m
            JOIN FETCH m.sender
            WHERE m.conversation.id = :conversationId
            AND (:beforeId IS NULL OR m.id < :beforeId)
            ORDER BY m.id DESC
            """)
    List<ChatMessage> findPage(@Param("conversationId") Long conversationId,
                               @Param("beforeId") Long beforeId,
                               Pageable pageable);

    /** The message a retried send already stored, if any. */
    Optional<ChatMessage> findByConversationIdAndSenderPublicIdAndClientMessageId(Long conversationId,
                                                                                 UUID senderId,
                                                                                 UUID clientMessageId);

    boolean existsByIdAndConversationId(Long id, Long conversationId);

    /** Messages from the other side after {@code afterId} (null: from the start). */
    @Query("""
            SELECT COUNT(m) FROM ChatMessage m
            WHERE m.conversation.id = :conversationId
            AND m.sender.publicId <> :userId
            AND (:afterId IS NULL OR m.id > :afterId)
            """)
    long countUnread(@Param("conversationId") Long conversationId,
                     @Param("userId") UUID userId,
                     @Param("afterId") Long afterId);

    /** The unread count of each of the user's conversations that has any, in a single query. */
    @Query("""
            SELECT m.conversation.id AS conversationId, COUNT(m) AS count
            FROM ChatMessage m JOIN m.conversation c
            WHERE (c.client.publicId = :userId OR c.professional.publicId = :userId)
            AND m.sender.publicId <> :userId
            AND m.id > COALESCE(CASE WHEN c.client.publicId = :userId
                    THEN c.clientLastReadMessageId ELSE c.professionalLastReadMessageId END, 0)
            GROUP BY m.conversation.id
            """)
    List<UnreadCount> countUnreadByConversation(@Param("userId") UUID userId);

    /** Deletes the messages older than that, cards included (the job stays in Mis solicitudes). */
    @Modifying
    @Query("DELETE FROM ChatMessage m WHERE m.createdAt < :before")
    int deleteOlderThan(@Param("before") OffsetDateTime before);

    interface UnreadCount {
        Long getConversationId();
        long getCount();
    }
}
