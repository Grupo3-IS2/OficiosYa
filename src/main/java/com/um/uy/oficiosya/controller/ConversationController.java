package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.dto.request.ChatMessageCreateRequest;
import com.um.uy.oficiosya.dto.request.ChatReadRequest;
import com.um.uy.oficiosya.dto.request.ConversationCreateRequest;
import com.um.uy.oficiosya.dto.response.ChatMessageResponse;
import com.um.uy.oficiosya.dto.response.ConversationResponse;
import com.um.uy.oficiosya.dto.response.UnreadCountResponse;
import com.um.uy.oficiosya.service.interfaces.ChatService;
import com.um.uy.oficiosya.service.interfaces.ChatService.FoundOrCreated;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;

/**
 * The 1 to 1 chat between a client and a professional. There is one conversation per pair of users,
 * opened from a professional's profile or from a job they share (see JobRequestController). Every
 * endpoint acts as the caller identified by the token, who has to take part in the conversation.
 * Messages are sent here and stored; both sides also get them live over STOMP (/user/queue/messages).
 */
@PreAuthorize("hasRole('CLIENT')")
@RestController
@RequestMapping("/api/v1/conversations")
public class ConversationController {

    private final ChatService chatService;

    public ConversationController(ChatService chatService) {
        this.chatService = chatService;
    }

    /**
     * Contact from a professional's public profile: 201 if the conversation is new, 200 if the pair
     * already had one. 404 if the professional doesn't exist or isn't published (unless they already
     * had a conversation), 429 past the daily limit of new conversations.
     */
    @PostMapping
    public ResponseEntity<ConversationResponse> openConversation(@Valid @RequestBody ConversationCreateRequest request,
                                                                 Authentication authentication) {
        FoundOrCreated<ConversationResponse> conversation =
                chatService.openWithProfessional(request.getProfessionalId(), AuthenticatedUser.id(authentication));
        return foundOrCreated(conversation);
    }

    /** The caller's inbox, most recent first; conversations without messages yet are left out. */
    @GetMapping
    public ResponseEntity<List<ConversationResponse>> getConversations(Authentication authentication) {
        return ResponseEntity.ok(chatService.getConversations(AuthenticatedUser.id(authentication)));
    }

    /** Unread messages across all the caller's conversations, for the header's badge. */
    @GetMapping("/unread-count")
    public ResponseEntity<UnreadCountResponse> getUnreadCount(Authentication authentication) {
        return ResponseEntity.ok(new UnreadCountResponse(chatService.getUnreadCount(AuthenticatedUser.id(authentication))));
    }

    /**
     * A page of the history, newest first: the latest messages, or the ones older than {@code before}
     * (a message id). {@code limit} is 30 by default and at most 100.
     */
    @GetMapping("/{id}/messages")
    public ResponseEntity<List<ChatMessageResponse>> getMessages(@PathVariable Long id,
                                                                 @RequestParam(required = false) Long before,
                                                                 @RequestParam(required = false) Integer limit,
                                                                 Authentication authentication) {
        return ResponseEntity.ok(chatService.getMessages(id, AuthenticatedUser.id(authentication), before, limit));
    }

    /**
     * Sends a text message: 201 when stored, 200 if it's a retry of one already stored (same
     * clientMessageId). 403 if the conversation is blocked, 429 past the per minute limit.
     */
    @PostMapping("/{id}/messages")
    public ResponseEntity<ChatMessageResponse> sendMessage(@PathVariable Long id,
                                                           @Valid @RequestBody ChatMessageCreateRequest request,
                                                           Authentication authentication) {
        FoundOrCreated<ChatMessageResponse> message =
                chatService.sendMessage(id, request, AuthenticatedUser.id(authentication));
        return ResponseEntity.status(message.created() ? HttpStatus.CREATED : HttpStatus.OK).body(message.value());
    }

    /** Marks the conversation read up to that message, never backwards. The other side isn't told. */
    @PostMapping("/{id}/read")
    public ResponseEntity<Void> markRead(@PathVariable Long id,
                                         @Valid @RequestBody ChatReadRequest request,
                                         Authentication authentication) {
        chatService.markRead(id, request.getLastReadMessageId(), AuthenticatedUser.id(authentication));
        return ResponseEntity.noContent().build();
    }

    /** The caller blocks the conversation: nobody can write in it or propose a job to the other. Idempotent. */
    @PostMapping("/{id}/block")
    public ResponseEntity<ConversationResponse> block(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(chatService.block(id, AuthenticatedUser.id(authentication)));
    }

    /** Lifts the caller's own block; a block by the other side stays. */
    @DeleteMapping("/{id}/block")
    public ResponseEntity<ConversationResponse> unblock(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(chatService.unblock(id, AuthenticatedUser.id(authentication)));
    }

    /** 201 with the conversation's location if it was just created, 200 if it already existed. */
    static ResponseEntity<ConversationResponse> foundOrCreated(FoundOrCreated<ConversationResponse> conversation) {
        if (!conversation.created()) {
            return ResponseEntity.ok(conversation.value());
        }
        URI location = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/v1/conversations/{id}")
                .buildAndExpand(conversation.value().getId())
                .toUri();
        return ResponseEntity.created(location).body(conversation.value());
    }
}
