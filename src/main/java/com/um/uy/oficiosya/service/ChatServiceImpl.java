package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.config.ChatRateLimiter;
import com.um.uy.oficiosya.dto.request.ChatMessageCreateRequest;
import com.um.uy.oficiosya.dto.response.ChatMessageResponse;
import com.um.uy.oficiosya.dto.response.ConversationResponse;
import com.um.uy.oficiosya.entity.ChatMessage;
import com.um.uy.oficiosya.entity.ChatMessageType;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Conversation;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.exception.ConversationNotFoundException;
import com.um.uy.oficiosya.exception.JobRequestNotFoundException;
import com.um.uy.oficiosya.mapper.ChatMapper;
import com.um.uy.oficiosya.repository.ChatMessageRepository;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.ConversationRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.service.interfaces.ChatService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ChatServiceImpl implements ChatService {

    private static final String CONVERSATION_NOT_FOUND = "Conversación no encontrada.";
    private static final String PROFESSIONAL_NOT_FOUND = "Profesional no encontrado.";

    static final int DEFAULT_PAGE_SIZE = 30;
    static final int MAX_PAGE_SIZE = 100;
    static final int PREVIEW_LENGTH = 120;

    private final ConversationRepository conversationRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ClientRepository clientRepository;
    private final ProfessionalRepository professionalRepository;
    private final JobRequestRepository jobRequestRepository;
    private final ChatMapper chatMapper;
    private final ChatRateLimiter rateLimiter;
    private final Clock clock;
    private final int maxMessageLength;

    public ChatServiceImpl(ConversationRepository conversationRepository,
                           ChatMessageRepository chatMessageRepository,
                           ClientRepository clientRepository,
                           ProfessionalRepository professionalRepository,
                           JobRequestRepository jobRequestRepository,
                           ChatMapper chatMapper,
                           ChatRateLimiter rateLimiter,
                           Clock clock,
                           @Value("${app.chat.message-max-length}") int maxMessageLength) {
        this.conversationRepository = conversationRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.clientRepository = clientRepository;
        this.professionalRepository = professionalRepository;
        this.jobRequestRepository = jobRequestRepository;
        this.chatMapper = chatMapper;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
        this.maxMessageLength = maxMessageLength;
    }

    @Override
    @Transactional
    public FoundOrCreated<ConversationResponse> openWithProfessional(UUID professionalId, UUID callerId) {
        if (professionalId.equals(callerId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes iniciar una conversación con vos mismo");
        }

        Client caller = clientRepository.findByPublicId(callerId)
                .orElseThrow(() -> new ClientNotFoundException("Cliente no encontrado."));
        Professional professional = professionalRepository.findByPublicId(professionalId)
                .orElseThrow(() -> new ClientNotFoundException(PROFESSIONAL_NOT_FOUND));

        // An existing conversation is returned even if the professional unpublished their profile since
        Conversation existing = conversationRepository.findBetween(caller.getId(), professional.getId()).orElse(null);
        if (existing != null) {
            return new FoundOrCreated<>(toResponse(existing, callerId), false);
        }

        // Same answer as the public search: an unpublished professional doesn't exist for clients
        if (!professional.isPublished()) {
            throw new ClientNotFoundException(PROFESSIONAL_NOT_FOUND);
        }

        rateLimiter.checkNewConversation(callerId);
        return create(caller, professional, callerId);
    }

    @Override
    @Transactional
    public FoundOrCreated<ConversationResponse> openForJobRequest(Long jobRequestId, UUID callerId) {
        JobRequest jobRequest = jobRequestRepository.findById(jobRequestId)
                .orElseThrow(() -> new JobRequestNotFoundException("Trabajo no encontrado."));

        if (!jobRequest.getClient().getPublicId().equals(callerId)
                && !jobRequest.getProfessional().getPublicId().equals(callerId)) {
            throw new AccessDeniedException("No tenés permiso para abrir la conversación de este trabajo");
        }

        // No rate limit here: the job already links the two, so this can't be used to reach strangers
        Conversation existing = conversationRepository
                .findBetween(jobRequest.getClient().getId(), jobRequest.getProfessional().getId()).orElse(null);
        if (existing != null) {
            return new FoundOrCreated<>(toResponse(existing, callerId), false);
        }

        return create(jobRequest.getClient(), jobRequest.getProfessional(), callerId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ConversationResponse> getConversations(UUID callerId) {
        Map<Long, Long> unread = chatMessageRepository.countUnreadByConversation(callerId).stream()
                .collect(Collectors.toMap(ChatMessageRepository.UnreadCount::getConversationId,
                        ChatMessageRepository.UnreadCount::getCount));

        return conversationRepository.findInbox(callerId).stream()
                .map(conversation -> chatMapper.toResponse(conversation, callerId,
                        unread.getOrDefault(conversation.getId(), 0L)))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public long getUnreadCount(UUID callerId) {
        return chatMessageRepository.countUnreadByConversation(callerId).stream()
                .mapToLong(ChatMessageRepository.UnreadCount::getCount)
                .sum();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChatMessageResponse> getMessages(Long conversationId, UUID callerId, Long beforeId, Integer limit) {
        Conversation conversation = findParticipating(conversationId, callerId);

        int pageSize = limit == null ? DEFAULT_PAGE_SIZE : Math.clamp(limit, 1, MAX_PAGE_SIZE);
        return chatMessageRepository.findPage(conversation.getId(), beforeId, PageRequest.of(0, pageSize)).stream()
                .map(chatMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public FoundOrCreated<ChatMessageResponse> sendMessage(Long conversationId, ChatMessageCreateRequest request,
                                                           UUID callerId) {
        Conversation conversation = findParticipating(conversationId, callerId);

        // A retry of a send that did go through (the response got lost) returns that same message
        ChatMessage retried = chatMessageRepository
                .findByConversationIdAndSenderPublicIdAndClientMessageId(conversationId, callerId,
                        request.getClientMessageId())
                .orElse(null);
        if (retried != null) {
            return new FoundOrCreated<>(chatMapper.toResponse(retried), false);
        }

        if (conversation.isBlocked()) {
            throw new AccessDeniedException("La conversación está bloqueada");
        }

        String content = validContent(request.getContent());
        JobRequest jobRequest = request.getJobRequestId() == null
                ? null : jobOfThePair(request.getJobRequestId(), conversation);

        rateLimiter.checkMessage(callerId);

        Client sender = conversation.isClientSide(callerId) ? conversation.getClient() : conversation.getProfessional();
        ChatMessage message = chatMessageRepository.save(ChatMessage.builder()
                .conversation(conversation)
                .sender(sender)
                .type(ChatMessageType.TEXT)
                .content(content)
                .jobRequest(jobRequest)
                .clientMessageId(request.getClientMessageId())
                .build());

        conversationRepository.updateLastMessage(conversationId, OffsetDateTime.now(clock), preview(content));

        return new FoundOrCreated<>(chatMapper.toResponse(message), true);
    }

    @Override
    @Transactional
    public void markRead(Long conversationId, Long lastReadMessageId, UUID callerId) {
        Conversation conversation = findParticipating(conversationId, callerId);

        if (!chatMessageRepository.existsByIdAndConversationId(lastReadMessageId, conversationId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El mensaje no es de esta conversación");
        }

        // The update itself skips an older id (pages can be read out of order), so it never goes backwards
        if (conversation.isClientSide(callerId)) {
            conversationRepository.markReadByClient(conversationId, lastReadMessageId);
        } else {
            conversationRepository.markReadByProfessional(conversationId, lastReadMessageId);
        }
    }

    /**
     * The insert is skipped if the pair's conversation appeared in between (two tabs opening it at
     * once), and either way the one in the database is returned.
     */
    private FoundOrCreated<ConversationResponse> create(Client client, Professional professional, UUID callerId) {
        boolean created = conversationRepository.insertIfAbsent(client.getId(), professional.getId()) == 1;
        Conversation conversation = conversationRepository.findBetween(client.getId(), professional.getId())
                .orElseThrow(() -> new IllegalStateException("The conversation just created is missing"));
        return new FoundOrCreated<>(toResponse(conversation, callerId), created);
    }

    private ConversationResponse toResponse(Conversation conversation, UUID viewerId) {
        long unread = chatMessageRepository.countUnread(conversation.getId(), viewerId,
                conversation.lastReadMessageIdOf(viewerId));
        return chatMapper.toResponse(conversation, viewerId, unread);
    }

    private Conversation findParticipating(Long conversationId, UUID callerId) {
        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new ConversationNotFoundException(CONVERSATION_NOT_FOUND));

        if (!conversation.hasParticipant(callerId)) {
            throw new AccessDeniedException("No tenés permiso para ver esta conversación");
        }

        return conversation;
    }

    /** Plain text, trimmed, between 1 and the configured length (counted in characters as the user sees them). */
    private String validContent(String content) {
        String trimmed = content == null ? "" : content.trim();
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El mensaje no puede estar vacío");
        }
        if (trimmed.codePointCount(0, trimmed.length()) > maxMessageLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El mensaje no puede superar los " + maxMessageLength + " caracteres");
        }
        return trimmed;
    }

    /** A message can only point at a job between the same two users, in either role. */
    private JobRequest jobOfThePair(Long jobRequestId, Conversation conversation) {
        JobRequest jobRequest = jobRequestRepository.findById(jobRequestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "El trabajo no es de esta conversación"));

        Long jobClient = jobRequest.getClient().getId();
        Long jobProfessional = jobRequest.getProfessional().getId();
        Long client = conversation.getClient().getId();
        Long professional = conversation.getProfessional().getId();
        boolean samePair = (Objects.equals(jobClient, client) && Objects.equals(jobProfessional, professional))
                || (Objects.equals(jobClient, professional) && Objects.equals(jobProfessional, client));
        if (!samePair) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El trabajo no es de esta conversación");
        }

        return jobRequest;
    }

    /** The first characters, without splitting an emoji in half. */
    private static String preview(String content) {
        if (content.codePointCount(0, content.length()) <= PREVIEW_LENGTH) {
            return content;
        }
        return content.substring(0, content.offsetByCodePoints(0, PREVIEW_LENGTH));
    }
}
