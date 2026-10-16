package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.response.ChatJobSummary;
import com.um.uy.oficiosya.dto.response.ChatMessageResponse;
import com.um.uy.oficiosya.dto.response.ChatParticipantResponse;
import com.um.uy.oficiosya.dto.response.ConversationResponse;
import com.um.uy.oficiosya.dto.response.TaskResponse;
import com.um.uy.oficiosya.entity.ChatMessage;
import com.um.uy.oficiosya.entity.ChatMessageType;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Conversation;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.Task;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.UUID;

@Mapper(componentModel = "spring")
public interface ChatMapper {

    @Mapping(target = "conversationId", source = "conversation.id")
    @Mapping(target = "senderId", source = "sender.publicId")
    @Mapping(target = "jobRequestId", source = "jobRequest.id")
    @Mapping(target = "job", expression = "java(jobOf(message))")
    ChatMessageResponse toResponse(ChatMessage message);

    /** Only a card carries the job; a TEXT message only says which one it's about (jobRequestId). */
    default ChatJobSummary jobOf(ChatMessage message) {
        return message.getType() == ChatMessageType.JOB_PROPOSAL ? toSummary(message.getJobRequest()) : null;
    }

    @Mapping(target = "tradeId", source = "trade.id")
    @Mapping(target = "tradeName", source = "trade.name")
    TaskResponse toResponse(Task task);

    /**
     * The card's timeframe: the scheduled block once accepted, otherwise the one the professional
     * proposed (kept after a rejection, so the card still shows what was offered); null if the client
     * proposed and nobody accepted it, or it was cancelled after being accepted (the block is gone).
     */
    default ChatJobSummary toSummary(JobRequest job) {
        Schedule block = job.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .findFirst()
                .orElse(null);

        return new ChatJobSummary(
                job.getId(),
                job.getStatus(),
                job.getProposedBy(),
                job.getTasks().stream().map(this::toResponse).toList(),
                job.getLocation(),
                job.getPaymentAmount(),
                block != null ? block.getStartTimestamp() : job.getProposedStart(),
                block != null ? block.getEndTimestamp() : job.getProposedEnd(),
                job.getRescheduleStart(),
                job.getRescheduleEnd());
    }

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
