package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.response.ChatMessageResponse;
import com.um.uy.oficiosya.dto.response.ChatParticipantResponse;
import com.um.uy.oficiosya.dto.response.ConversationResponse;
import com.um.uy.oficiosya.entity.ChatMessage;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Conversation;
import com.um.uy.oficiosya.entity.Role;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.UUID;

@Mapper(componentModel = "spring")
public interface ChatMapper {

    @Mapping(target = "conversationId", source = "conversation.id")
    @Mapping(target = "senderId", source = "sender.publicId")
    @Mapping(target = "jobRequestId", source = "jobRequest.id")
    ChatMessageResponse toResponse(ChatMessage message);

    /** Most of it depends on who is looking, so it's written by hand. */
    default ConversationResponse toResponse(Conversation conversation, UUID viewerId, long unreadCount) {
        boolean viewerIsClient = conversation.isClientSide(viewerId);
        Client other = conversation.otherParticipant(viewerId);

        ChatParticipantResponse otherParticipant = new ChatParticipantResponse(other.getPublicId(), other.getName(),
                other.getProfileImageUrl(), viewerIsClient ? Role.PROFESSIONAL : Role.CLIENT);

        return new ConversationResponse(
                conversation.getId(),
                otherParticipant,
                viewerIsClient ? Role.CLIENT : Role.PROFESSIONAL,
                conversation.getLastMessagePreview(),
                conversation.getLastMessageAt(),
                unreadCount,
                !conversation.isBlocked(),
                conversation.isBlockedBy(viewerId));
    }
}
