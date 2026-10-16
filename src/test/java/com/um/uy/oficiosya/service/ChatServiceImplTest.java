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
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.exception.ConversationNotFoundException;
import com.um.uy.oficiosya.exception.JobRequestNotFoundException;
import com.um.uy.oficiosya.mapper.ChatMapperImpl;
import com.um.uy.oficiosya.repository.ChatMessageRepository;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.ConversationRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.service.interfaces.ChatService.FoundOrCreated;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Opening, listing, reading and writing conversations, and who may do each. */
class ChatServiceImplTest {

    @Mock
    private ConversationRepository conversationRepository;
    @Mock
    private ChatMessageRepository chatMessageRepository;
    @Mock
    private ClientRepository clientRepository;
    @Mock
    private ProfessionalRepository professionalRepository;
    @Mock
    private JobRequestRepository jobRequestRepository;
    @Mock
    private ChatRateLimiter rateLimiter;
    @Mock
    private ChatContentFilter contentFilter;
    @Mock
    private ApplicationEventPublisher events;

    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 13, 12, 0, 0, 0, ZoneOffset.UTC);

    private ChatServiceImpl service;

    private final UUID clientId = UUID.randomUUID();
    private final UUID professionalId = UUID.randomUUID();
    private final UUID strangerId = UUID.randomUUID();
    private Client client;
    private Professional professional;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ChatServiceImpl(conversationRepository, chatMessageRepository, clientRepository,
                professionalRepository, jobRequestRepository, new ChatMapperImpl(), rateLimiter, contentFilter, events,
                Clock.fixed(Instant.from(NOW), ZoneOffset.UTC), 2000);
        client = Client.builder().id(1L).publicId(clientId).name("Ana").email("ana@example.com").build();
        professional = Professional.builder().id(2L).publicId(professionalId).name("Beto")
                .email("beto@example.com").phoneNumber("099123456").published(true).build();
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(conversationRepository.findBetween(anyLong(), anyLong())).thenReturn(Optional.empty());
        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(invocation -> {
            ChatMessage message = invocation.getArgument(0);
            message.setId(500L);
            return message;
        });
    }

    private Conversation conversation() {
        Conversation conversation = Conversation.builder().id(12L).client(client).professional(professional).build();
        when(conversationRepository.findById(12L)).thenReturn(Optional.of(conversation));
        return conversation;
    }

    /** Stubs the pair's lookup so it finds this conversation, in whichever order the ids are asked. */
    private void existsBetween(Conversation conversation) {
        Long a = conversation.getClient().getId();
        Long b = conversation.getProfessional().getId();
        when(conversationRepository.findBetween(a, b)).thenReturn(Optional.of(conversation));
        when(conversationRepository.findBetween(b, a)).thenReturn(Optional.of(conversation));
    }

    private JobRequest job(Long id, Client jobClient, Professional jobProfessional, JobStatus status) {
        JobRequest job = JobRequest.builder().id(id).client(jobClient).professional(jobProfessional)
                .location("Montevideo").paymentAmount(BigDecimal.TEN).status(status).build();
        when(jobRequestRepository.findById(id)).thenReturn(Optional.of(job));
        return job;
    }

    private ChatMessageCreateRequest message(String content) {
        ChatMessageCreateRequest request = new ChatMessageCreateRequest();
        request.setContent(content);
        request.setClientMessageId(UUID.randomUUID());
        return request;
    }

    // --- open from the profile ---

    @Test
    void openWithProfessional_createsTheConversationWithTheCallerAsClient() {
        Conversation created = Conversation.builder().id(12L).client(client).professional(professional).build();
        when(conversationRepository.insertIfAbsent(1L, 2L)).thenReturn(1);
        when(conversationRepository.findBetween(1L, 2L)).thenReturn(Optional.empty(), Optional.of(created));

        FoundOrCreated<ConversationResponse> result = service.openWithProfessional(professionalId, clientId);

        assertTrue(result.created());
        verify(rateLimiter).checkNewConversation(clientId);
        ConversationResponse response = result.value();
        assertEquals(12L, response.getId());
        assertEquals(Role.CLIENT, response.getMyRole());
        assertEquals(professionalId, response.getOtherParticipant().getId());
        assertEquals("Beto", response.getOtherParticipant().getName());
        assertEquals(Role.PROFESSIONAL, response.getOtherParticipant().getRole());
        assertTrue(response.isCanWrite());
        assertFalse(response.isBlockedByMe());
        assertNull(response.getLastMessageAt());
    }

    @Test
    void openWithProfessional_returnsTheExistingOneWithoutCountingItAsNew() {
        Conversation existing = conversation();
        existsBetween(existing);
        when(chatMessageRepository.countUnread(12L, clientId, null)).thenReturn(2L);

        FoundOrCreated<ConversationResponse> result = service.openWithProfessional(professionalId, clientId);

        assertFalse(result.created());
        assertEquals(12L, result.value().getId());
        assertEquals(2, result.value().getUnreadCount());
        verify(conversationRepository, never()).insertIfAbsent(anyLong(), anyLong());
        verify(rateLimiter, never()).checkNewConversation(any());
    }

    @Test
    void openWithProfessional_whenAnotherRequestCreatedItInBetween_returnsThatOneAsExisting() {
        Conversation created = Conversation.builder().id(12L).client(client).professional(professional).build();
        when(conversationRepository.insertIfAbsent(1L, 2L)).thenReturn(0);
        when(conversationRepository.findBetween(1L, 2L)).thenReturn(Optional.empty(), Optional.of(created));

        FoundOrCreated<ConversationResponse> result = service.openWithProfessional(professionalId, clientId);

        assertFalse(result.created());
        assertEquals(12L, result.value().getId());
    }

    @Test
    void openWithProfessional_anUnpublishedProfessionalIsNotFound() {
        professional.setPublished(false);

        assertThrows(ClientNotFoundException.class, () -> service.openWithProfessional(professionalId, clientId));
        verify(conversationRepository, never()).insertIfAbsent(anyLong(), anyLong());
    }

    @Test
    void openWithProfessional_anUnpublishedProfessionalStillReturnsAnExistingConversation() {
        professional.setPublished(false);
        existsBetween(conversation());

        FoundOrCreated<ConversationResponse> result = service.openWithProfessional(professionalId, clientId);

        assertFalse(result.created());
        assertEquals(12L, result.value().getId());
    }

    @Test
    void openWithProfessional_aMissingProfessionalIsNotFound() {
        UUID missing = UUID.randomUUID();
        when(professionalRepository.findByPublicId(missing)).thenReturn(Optional.empty());

        assertThrows(ClientNotFoundException.class, () -> service.openWithProfessional(missing, clientId));
    }

    @Test
    void openWithProfessional_withYourselfIsABadRequest() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.openWithProfessional(professionalId, professionalId));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
    }

    @Test
    void openWithProfessional_pastTheDailyLimitIsRejectedWithoutCreating() {
        doThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS))
                .when(rateLimiter).checkNewConversation(clientId);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.openWithProfessional(professionalId, clientId));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, e.getStatusCode());
        verify(conversationRepository, never()).insertIfAbsent(anyLong(), anyLong());
    }

    // --- open from a job ---

    @Test
    void openForJobRequest_returnsTheSameConversationThePairAlreadyHas_forEitherSide() {
        Conversation existing = conversation();
        existsBetween(existing);
        job(87L, client, professional, JobStatus.PROPOSED);
        job(88L, client, professional, JobStatus.COMPLETED);

        assertEquals(12L, service.openForJobRequest(87L, clientId).value().getId());
        assertEquals(12L, service.openForJobRequest(88L, professionalId).value().getId());
        assertEquals(Role.PROFESSIONAL, service.openForJobRequest(88L, professionalId).value().getMyRole());
        verify(conversationRepository, never()).insertIfAbsent(anyLong(), anyLong());
    }

    @Test
    void openForJobRequest_findsThePairEvenWithTheRolesSwapped() {
        // Beto (a professional) wrote to Carla from her profile; now Carla asks Beto for a job
        Professional carla = Professional.builder().id(3L).publicId(UUID.randomUUID()).name("Carla")
                .email("carla@example.com").phoneNumber("099000000").published(true).build();
        Conversation fromProfile = Conversation.builder().id(12L).client(professional).professional(carla).build();
        when(conversationRepository.findBetween(3L, 2L)).thenReturn(Optional.of(fromProfile));
        job(87L, carla, professional, JobStatus.PROPOSED);

        FoundOrCreated<ConversationResponse> result = service.openForJobRequest(87L, carla.getPublicId());

        assertFalse(result.created());
        assertEquals(12L, result.value().getId());
        assertEquals(Role.PROFESSIONAL, result.value().getMyRole());
        assertEquals(professionalId, result.value().getOtherParticipant().getId());
    }

    @Test
    void openForJobRequest_createsItWithTheJobsRolesAndNoRateLimit() {
        job(87L, client, professional, JobStatus.ACCEPTED);
        Conversation created = Conversation.builder().id(12L).client(client).professional(professional).build();
        when(conversationRepository.insertIfAbsent(1L, 2L)).thenReturn(1);
        when(conversationRepository.findBetween(1L, 2L)).thenReturn(Optional.empty(), Optional.of(created));

        FoundOrCreated<ConversationResponse> result = service.openForJobRequest(87L, professionalId);

        assertTrue(result.created());
        assertEquals(Role.PROFESSIONAL, result.value().getMyRole());
        verify(rateLimiter, never()).checkNewConversation(any());
    }

    @Test
    void openForJobRequest_someoneOutsideTheJobIsDenied() {
        job(87L, client, professional, JobStatus.PROPOSED);

        assertThrows(AccessDeniedException.class, () -> service.openForJobRequest(87L, strangerId));
    }

    @Test
    void openForJobRequest_aMissingJobIsNotFound() {
        when(jobRequestRepository.findById(87L)).thenReturn(Optional.empty());

        assertThrows(JobRequestNotFoundException.class, () -> service.openForJobRequest(87L, clientId));
    }

    // --- inbox and unread count ---

    @Test
    void getConversations_showsEachFromTheCallersSideWithItsUnreadCount() {
        Client carla = Client.builder().id(3L).publicId(UUID.randomUUID()).name("Carla").build();
        Conversation asClient = Conversation.builder().id(12L).client(client).professional(professional)
                .lastMessageAt(NOW).lastMessagePreview("¿Puedes el jueves?").build();
        Conversation asProfessional = Conversation.builder().id(13L).client(carla).professional(professional)
                .lastMessageAt(NOW.minusDays(1)).professionalBlockedAt(NOW).build();
        when(conversationRepository.findInbox(professionalId)).thenReturn(List.of(asClient, asProfessional));
        when(chatMessageRepository.countUnreadByConversation(professionalId)).thenReturn(List.of(unread(13L, 4)));

        List<ConversationResponse> inbox = service.getConversations(professionalId);

        assertEquals(List.of(12L, 13L), inbox.stream().map(ConversationResponse::getId).toList());
        assertEquals("Ana", inbox.getFirst().getOtherParticipant().getName());
        assertEquals("¿Puedes el jueves?", inbox.getFirst().getLastMessagePreview());
        assertEquals(0, inbox.getFirst().getUnreadCount());
        assertEquals("Carla", inbox.get(1).getOtherParticipant().getName());
        assertEquals(4, inbox.get(1).getUnreadCount());
        assertFalse(inbox.get(1).isCanWrite());
        assertTrue(inbox.get(1).isBlockedByMe());
    }

    @Test
    void getUnreadCount_addsUpEveryConversation() {
        when(chatMessageRepository.countUnreadByConversation(clientId)).thenReturn(List.of(unread(12L, 2), unread(13L, 3)));

        assertEquals(5, service.getUnreadCount(clientId));
    }

    private static ChatMessageRepository.UnreadCount unread(Long conversationId, long count) {
        return new ChatMessageRepository.UnreadCount() {
            @Override
            public Long getConversationId() {
                return conversationId;
            }

            @Override
            public long getCount() {
                return count;
            }
        };
    }

    // --- history ---

    @Test
    void getMessages_returnsThePageForAParticipant() {
        Conversation conversation = conversation();
        ChatMessage hola = ChatMessage.builder().id(345L).conversation(conversation).sender(client)
                .type(ChatMessageType.TEXT).content("Hola").clientMessageId(UUID.randomUUID()).build();
        when(chatMessageRepository.findPage(eq(12L), eq(400L), any(Pageable.class))).thenReturn(List.of(hola));

        List<ChatMessageResponse> page = service.getMessages(12L, professionalId, 400L, null);

        assertEquals(1, page.size());
        assertEquals(345L, page.getFirst().getId());
        assertEquals(12L, page.getFirst().getConversationId());
        assertEquals(clientId, page.getFirst().getSenderId());
        assertEquals("Hola", page.getFirst().getContent());
        assertEquals(ChatMessageType.TEXT, page.getFirst().getType());
    }

    @Test
    void getMessages_usesThirtyByDefaultAndNeverMoreThanAHundred() {
        conversation();
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        when(chatMessageRepository.findPage(eq(12L), any(), pageable.capture())).thenReturn(List.of());

        service.getMessages(12L, clientId, null, null);
        service.getMessages(12L, clientId, null, 1000);
        service.getMessages(12L, clientId, null, 0);

        assertEquals(List.of(30, 100, 1), pageable.getAllValues().stream().map(Pageable::getPageSize).toList());
    }

    @Test
    void getMessages_someoneOutsideTheConversationIsDenied() {
        conversation();

        assertThrows(AccessDeniedException.class, () -> service.getMessages(12L, strangerId, null, null));
    }

    @Test
    void getMessages_aMissingConversationIsNotFound() {
        when(conversationRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(ConversationNotFoundException.class, () -> service.getMessages(99L, clientId, null, null));
    }

    // --- send ---

    @Test
    void sendMessage_storesItTrimmedAndUpdatesTheInbox() {
        conversation();

        FoundOrCreated<ChatMessageResponse> result = service.sendMessage(12L, message("  Hola, ¿puedes el jueves?  "),
                professionalId);

        assertTrue(result.created());
        ArgumentCaptor<ChatMessage> saved = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository).save(saved.capture());
        assertEquals(ChatMessageType.TEXT, saved.getValue().getType());
        assertEquals("Hola, ¿puedes el jueves?", saved.getValue().getContent());
        assertEquals(professional, saved.getValue().getSender());
        assertNull(saved.getValue().getJobRequest());
        verify(conversationRepository).updateLastMessage(12L, NOW, "Hola, ¿puedes el jueves?");
        verify(conversationRepository, never()).save(any());
        verify(rateLimiter).checkMessage(professionalId);
        assertEquals(500L, result.value().getId());
        assertEquals(professionalId, result.value().getSenderId());
    }

    @Test
    void sendMessage_thePreviewIsTheFirst120CharactersWithoutSplittingAnEmoji() {
        conversation();

        service.sendMessage(12L, message("a".repeat(119) + "😀😀"), clientId);

        verify(conversationRepository).updateLastMessage(12L, NOW, "a".repeat(119) + "😀");
    }

    @ParameterizedTest
    @EnumSource(JobStatus.class)
    void sendMessage_canPointAtAJobOfThePairInAnyStatus(JobStatus status) {
        conversation();
        JobRequest job = job(87L, client, professional, status);
        ChatMessageCreateRequest request = message("Sobre este trabajo");
        request.setJobRequestId(87L);

        ChatMessageResponse response = service.sendMessage(12L, request, clientId).value();

        assertEquals(87L, response.getJobRequestId());
        ArgumentCaptor<ChatMessage> saved = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository).save(saved.capture());
        assertEquals(job, saved.getValue().getJobRequest());
    }

    @Test
    void sendMessage_canPointAtAJobOfThePairWithTheRolesSwapped() {
        conversation();
        Professional clientAsProfessional = Professional.builder().id(1L).publicId(clientId).name("Ana").build();
        job(87L, professional, clientAsProfessional, JobStatus.PROPOSED);
        ChatMessageCreateRequest request = message("Sobre este trabajo");
        request.setJobRequestId(87L);

        assertEquals(87L, service.sendMessage(12L, request, clientId).value().getJobRequestId());
    }

    @Test
    void sendMessage_aJobOfAnotherPairIsABadRequest() {
        conversation();
        Client carla = Client.builder().id(3L).publicId(UUID.randomUUID()).name("Carla").build();
        job(87L, carla, professional, JobStatus.ACCEPTED);
        ChatMessageCreateRequest request = message("Sobre este trabajo");
        request.setJobRequestId(87L);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.sendMessage(12L, request, professionalId));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        verify(chatMessageRepository, never()).save(any());
    }

    @Test
    void sendMessage_aMissingJobIsABadRequest() {
        conversation();
        when(jobRequestRepository.findById(87L)).thenReturn(Optional.empty());
        ChatMessageCreateRequest request = message("Sobre este trabajo");
        request.setJobRequestId(87L);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.sendMessage(12L, request, clientId));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "\n\t "})
    void sendMessage_emptyContentIsABadRequest(String content) {
        conversation();
        ChatMessageCreateRequest request = message(content);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.sendMessage(12L, request, clientId));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        verify(chatMessageRepository, never()).save(any());
    }

    @Test
    void sendMessage_upTo2000CharactersIsFineAndMoreIsABadRequest() {
        conversation();

        assertTrue(service.sendMessage(12L, message("a".repeat(2000)), clientId).created());
        assertTrue(service.sendMessage(12L, message("😀".repeat(2000)), clientId).created());
        ChatMessageCreateRequest tooLong = message("a".repeat(2001));
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.sendMessage(12L, tooLong, clientId));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
    }

    @Test
    void sendMessage_aRetryWithTheSameClientMessageIdReturnsTheStoredOne() {
        Conversation conversation = conversation();
        ChatMessageCreateRequest request = message("Hola");
        ChatMessage stored = ChatMessage.builder().id(345L).conversation(conversation).sender(client)
                .type(ChatMessageType.TEXT).content("Hola").clientMessageId(request.getClientMessageId()).build();
        when(chatMessageRepository.findByConversationIdAndSenderPublicIdAndClientMessageId(12L, clientId,
                request.getClientMessageId())).thenReturn(Optional.of(stored));

        FoundOrCreated<ChatMessageResponse> result = service.sendMessage(12L, request, clientId);

        assertFalse(result.created());
        assertEquals(345L, result.value().getId());
        verify(chatMessageRepository, never()).save(any());
        verify(rateLimiter, never()).checkMessage(any());
    }

    @Test
    void sendMessage_someoneOutsideTheConversationIsDenied() {
        conversation();
        ChatMessageCreateRequest request = message("Hola");

        assertThrows(AccessDeniedException.class, () -> service.sendMessage(12L, request, strangerId));
        verify(chatMessageRepository, never()).save(any());
    }

    @Test
    void sendMessage_aBlockedConversationCantBeWrittenToByEitherSide() {
        Conversation conversation = conversation();
        conversation.setClientBlockedAt(NOW);
        ChatMessageCreateRequest fromTheClient = message("Hola");
        ChatMessageCreateRequest fromTheProfessional = message("Hola");

        assertThrows(AccessDeniedException.class, () -> service.sendMessage(12L, fromTheClient, clientId));
        assertThrows(AccessDeniedException.class, () -> service.sendMessage(12L, fromTheProfessional, professionalId));
        verify(chatMessageRepository, never()).save(any());
    }

    @Test
    void aBlockedConversationCanStillBeRead() {
        Conversation conversation = conversation();
        conversation.setProfessionalBlockedAt(NOW);
        when(chatMessageRepository.findPage(eq(12L), any(), any(Pageable.class))).thenReturn(List.of());

        assertEquals(List.of(), service.getMessages(12L, clientId, null, null));
    }

    @Test
    void sendMessage_pastTheRateLimitIsRejectedWithoutStoring() {
        conversation();
        doThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS)).when(rateLimiter).checkMessage(clientId);
        ChatMessageCreateRequest request = message("Hola");

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.sendMessage(12L, request, clientId));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, e.getStatusCode());
        verify(chatMessageRepository, never()).save(any());
    }

    // --- read ---

    @Test
    void markRead_movesTheCallersSideOnly_withAnUpdateThatNeverGoesBackwards() {
        conversation();
        when(chatMessageRepository.existsByIdAndConversationId(345L, 12L)).thenReturn(true);

        service.markRead(12L, 345L, professionalId);
        service.markRead(12L, 345L, clientId);

        verify(conversationRepository).markReadByProfessional(12L, 345L);
        verify(conversationRepository).markReadByClient(12L, 345L);
        verify(conversationRepository, never()).save(any());
    }

    @Test
    void markRead_aMessageOfAnotherConversationIsABadRequest() {
        conversation();
        when(chatMessageRepository.existsByIdAndConversationId(345L, 12L)).thenReturn(false);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.markRead(12L, 345L, clientId));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
    }

    @Test
    void markRead_someoneOutsideTheConversationIsDenied() {
        conversation();

        assertThrows(AccessDeniedException.class, () -> service.markRead(12L, 345L, strangerId));
        verify(conversationRepository, never()).markReadByClient(anyLong(), anyLong());
        verify(conversationRepository, never()).markReadByProfessional(anyLong(), anyLong());
    }

    // --- blocking, as each side sees it ---

    @Test
    void canWriteAndBlockedByMeDependOnWhoBlocked() {
        Conversation conversation = conversation();
        conversation.setClientBlockedAt(NOW);
        existsBetween(conversation);
        job(87L, client, professional, JobStatus.PROPOSED);

        ConversationResponse forTheClient = service.openWithProfessional(professionalId, clientId).value();
        ConversationResponse forTheProfessional = service.openForJobRequest(87L, professionalId).value();

        assertFalse(forTheClient.isCanWrite());
        assertTrue(forTheClient.isBlockedByMe());
        assertFalse(forTheProfessional.isCanWrite());
        assertFalse(forTheProfessional.isBlockedByMe());
        verify(conversationRepository, never()).insertIfAbsent(anyLong(), anyLong());
    }

    // --- block ---

    @Test
    void block_isTheCallersOwnAndIdempotent_andUnblockLiftsOnlyTheirs() {
        Conversation conversation = conversation();
        conversation.setProfessionalBlockedAt(NOW.minusDays(1));
        when(conversationRepository.save(conversation)).thenReturn(conversation);

        ConversationResponse blocked = service.block(12L, clientId);
        OffsetDateTime blockedAt = conversation.getClientBlockedAt();
        service.block(12L, clientId);

        assertEquals(NOW, blockedAt);
        assertEquals(blockedAt, conversation.getClientBlockedAt());
        assertTrue(blocked.isBlockedByMe());
        assertFalse(blocked.isCanWrite());

        ConversationResponse unblocked = service.unblock(12L, clientId);

        assertNull(conversation.getClientBlockedAt());
        assertFalse(unblocked.isBlockedByMe());
        // The other side's block is still there
        assertFalse(unblocked.isCanWrite());
    }

    @Test
    void block_someoneOutsideTheConversationIsDenied() {
        conversation();

        assertThrows(AccessDeniedException.class, () -> service.block(12L, strangerId));
        assertThrows(AccessDeniedException.class, () -> service.unblock(12L, strangerId));
    }

    @Test
    void openWithProfessional_returnsTheBlockedConversationInsteadOfCreatingAnother() {
        Conversation conversation = conversation();
        conversation.setProfessionalBlockedAt(NOW);
        existsBetween(conversation);

        FoundOrCreated<ConversationResponse> result = service.openWithProfessional(professionalId, clientId);

        assertEquals(12L, result.value().getId());
        assertFalse(result.value().isCanWrite());
        verify(conversationRepository, never()).insertIfAbsent(anyLong(), anyLong());
    }

    // --- content filter and push ---

    @Test
    void sendMessage_isCheckedByTheFilter_andARefusedOneIsNotStored() {
        Conversation conversation = conversation();
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST)).when(contentFilter).check("099 123 456", conversation);

        assertThrows(ResponseStatusException.class, () -> service.sendMessage(12L, message("099 123 456"), clientId));
        verify(chatMessageRepository, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    void sendMessage_isPushedToBothSides() {
        conversation();

        service.sendMessage(12L, message("Hola"), clientId);

        ArgumentCaptor<ChatMessageSent> sent = ArgumentCaptor.forClass(ChatMessageSent.class);
        verify(events).publishEvent(sent.capture());
        assertEquals(java.util.Set.of(clientId, professionalId), sent.getValue().recipientIds());
        assertEquals("Hola", sent.getValue().message().getContent());
    }

    // --- the proposal's card ---

    @Test
    void addJobProposal_leavesACardFromWhoeverProposed_movesTheInboxAndPushesIt() {
        Conversation conversation = conversation();
        existsBetween(conversation);
        JobRequest job = job(87L, client, professional, JobStatus.PROPOSED);
        job.setProposedBy(Role.PROFESSIONAL);

        service.addJobProposal(87L);

        ArgumentCaptor<ChatMessage> saved = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository).save(saved.capture());
        assertEquals(ChatMessageType.JOB_PROPOSAL, saved.getValue().getType());
        assertEquals(professional, saved.getValue().getSender());
        assertNull(saved.getValue().getContent());
        assertEquals(job, saved.getValue().getJobRequest());
        assertTrue(saved.getValue().isConsistentWithType());
        verify(conversationRepository).updateLastMessage(12L, NOW, "Trabajo propuesto");

        ArgumentCaptor<ChatMessageSent> sent = ArgumentCaptor.forClass(ChatMessageSent.class);
        verify(events).publishEvent(sent.capture());
        assertEquals(87L, sent.getValue().message().getJob().getId());
    }

    @Test
    void addJobProposal_createsTheConversationIfThePairHadNone_withoutCountingItAsNew() {
        Conversation conversation = Conversation.builder().id(12L).client(client).professional(professional).build();
        job(87L, client, professional, JobStatus.PROPOSED);
        when(conversationRepository.findBetween(1L, 2L)).thenReturn(Optional.empty(), Optional.of(conversation));

        service.addJobProposal(87L);

        verify(conversationRepository).insertIfAbsent(1L, 2L);
        verify(rateLimiter, never()).checkNewConversation(any());
        ArgumentCaptor<ChatMessage> saved = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository).save(saved.capture());
        assertEquals(client, saved.getValue().getSender());
    }

    @Test
    void addJobProposal_whenSavingTheCardFails_theErrorReachesTheProposal() {
        Conversation conversation = conversation();
        existsBetween(conversation);
        job(87L, client, professional, JobStatus.PROPOSED);
        when(chatMessageRepository.save(any(ChatMessage.class))).thenThrow(new IllegalStateException("db down"));

        // The listener is synchronous inside the job's transaction, so this rolls the proposal back
        assertThrows(IllegalStateException.class, () -> service.addJobProposal(87L));
    }

    @Test
    void getMessages_loadsTheCardsJobsInASingleQuery() {
        Conversation conversation = conversation();
        JobRequest job = job(87L, client, professional, JobStatus.PROPOSED);
        ChatMessage card = ChatMessage.builder().id(1L).conversation(conversation).sender(client)
                .type(ChatMessageType.JOB_PROPOSAL).jobRequest(job).clientMessageId(UUID.randomUUID()).build();
        ChatMessage again = ChatMessage.builder().id(2L).conversation(conversation).sender(client)
                .type(ChatMessageType.JOB_PROPOSAL).jobRequest(job).clientMessageId(UUID.randomUUID()).build();
        when(chatMessageRepository.findPage(eq(12L), any(), any(Pageable.class))).thenReturn(List.of(again, card));

        List<ChatMessageResponse> page = service.getMessages(12L, clientId, null, null);

        verify(jobRequestRepository).findAllById(List.of(87L));
        assertEquals(JobStatus.PROPOSED, page.get(0).getJob().getStatus());
    }

    @Test
    void getJobUpdate_isTheCardAsItIsNow_forBothSides_withoutANewMessage() {
        Conversation conversation = conversation();
        existsBetween(conversation);
        job(87L, client, professional, JobStatus.ACCEPTED);

        var update = service.getJobUpdate(87L).orElseThrow();

        assertEquals(12L, update.conversationId());
        assertEquals(JobStatus.ACCEPTED, update.job().getStatus());
        assertEquals(java.util.Set.of(clientId, professionalId), update.recipientIds());
        verify(chatMessageRepository, never()).save(any());
        verify(conversationRepository, never()).updateLastMessage(any(), any(), any());
    }
}
