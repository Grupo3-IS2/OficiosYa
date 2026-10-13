package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ChatMessageCreateRequest;
import com.um.uy.oficiosya.dto.response.ChatMessageResponse;
import com.um.uy.oficiosya.dto.response.ConversationResponse;

import java.util.List;
import java.util.UUID;

/** The 1 to 1 chat: one conversation per pair of users, whatever jobs they have together. */
public interface ChatService {

    /**
     * From a professional's public profile: the conversation between the caller and that professional,
     * created if it doesn't exist yet. Creating one needs the professional to be published and counts
     * against the caller's daily limit of new conversations; an existing one is returned regardless.
     */
    FoundOrCreated<ConversationResponse> openWithProfessional(UUID professionalId, UUID callerId);

    /** From a job: the conversation between its two sides, created if needed. Either side of the job can call it. */
    FoundOrCreated<ConversationResponse> openForJobRequest(Long jobRequestId, UUID callerId);

    /** The caller's conversations on either side that have any message, most recent first. */
    List<ConversationResponse> getConversations(UUID callerId);

    /** Unread messages across all of the caller's conversations, for the header's badge. */
    long getUnreadCount(UUID callerId);

    /** A page of the history, newest first: up to {@code limit} messages older than {@code beforeId} (null: the latest). */
    List<ChatMessageResponse> getMessages(Long conversationId, UUID callerId, Long beforeId, Integer limit);

    /** Stores a TEXT message; sending the same clientMessageId again returns the one already stored. */
    FoundOrCreated<ChatMessageResponse> sendMessage(Long conversationId, ChatMessageCreateRequest request, UUID callerId);

    /** Marks the conversation read up to that message, never backwards. The other side is not told (no "seen"). */
    void markRead(Long conversationId, Long lastReadMessageId, UUID callerId);

    /** What a get-or-create returned, and whether it had to create it (201) or it already existed (200). */
    record FoundOrCreated<T>(T value, boolean created) {
    }
}
