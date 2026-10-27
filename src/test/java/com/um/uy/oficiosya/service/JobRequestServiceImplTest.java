package com.um.uy.oficiosya.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCancelRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRejectRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRescheduleRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.request.TaskCreateRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.dto.response.ServiceAreaResponse;
import com.um.uy.oficiosya.dto.response.ReviewResponse;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Conversation;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.ServiceArea;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.exception.JobRequestNotFoundException;
import com.um.uy.oficiosya.exception.TradeNotFoundException;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.mapper.JobRequestMapperImpl;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.ConversationRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The job lifecycle: PROPOSED → ACCEPTED → COMPLETED → reviewed, plus reject, cancel and reschedule, and who may do each. */
class JobRequestServiceImplTest {

    @Mock
    private JobRequestRepository jobRequestRepository;
    @Mock
    private ClientRepository clientRepository;
    @Mock
    private ProfessionalRepository professionalRepository;
    @Mock
    private TradeRepository tradeRepository;
    @Mock
    private ScheduleService scheduleService;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private ApplicationEventPublisher events;
    @Mock
    private ConversationRepository conversationRepository;

    private JobRequestServiceImpl service;

    private final UUID clientId = UUID.randomUUID();
    private final UUID professionalId = UUID.randomUUID();
    private final UUID strangerId = UUID.randomUUID();
    private Client client;
    private Professional professional;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new JobRequestServiceImpl(jobRequestRepository, clientRepository, professionalRepository,
                tradeRepository, new JobRequestMapperImpl(), scheduleService, passwordEncoder, Clock.systemUTC(), 24, events, conversationRepository);
        client = Client.builder().id(1L).publicId(clientId).name("Ana").email("ana@example.com").build();
        professional = Professional.builder().id(2L).publicId(professionalId).name("Beto")
                .email("beto@example.com").phoneNumber("099123456").build();
        when(jobRequestRepository.save(any(JobRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jobRequestRepository.saveAndFlush(any(JobRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private JobRequest job(JobStatus status) {
        JobRequest job = JobRequest.builder().id(10L).client(client).professional(professional)
                .location("Montevideo").paymentAmount(BigDecimal.TEN).confirmationPinHash("hash").status(status).build();
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.of(job));
        return job;
    }

    /** An accepted job whose agenda block starts at the given time. */
    private JobRequest scheduledJob(JobStatus status, OffsetDateTime start) {
        JobRequest job = job(status);
        job.getSchedules().add(Schedule.builder().id(7L).type(ScheduleType.SCHEDULED_JOB)
                .startTimestamp(start).endTimestamp(start.plusHours(2)).build());
        return job;
    }

    private JobRequestCreateRequest createRequest(Long tradeId) {
        TaskCreateRequest task = new TaskCreateRequest();
        task.setTradeId(tradeId);
        task.setDescription("Arreglar la canilla");
        JobRequestCreateRequest request = new JobRequestCreateRequest();
        request.setProfessionalId(professionalId);
        request.setLocation("Montevideo");
        request.setPaymentAmount(BigDecimal.valueOf(500));
        request.setTasks(List.of(task));
        return request;
    }

    // --- create ---

    @Test
    void createJobRequest_savesTheJobWithItsTasksAndReturnsThePinOnce() {
        Trade trade = Trade.builder().id(3L).name("Plomería").build();
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(tradeRepository.findById(3L)).thenReturn(Optional.of(trade));
        when(passwordEncoder.encode(anyString())).thenReturn("pin-hash");

        JobRequestResponse response = service.createJobRequest(createRequest(3L), clientId);

        ArgumentCaptor<JobRequest> saved = ArgumentCaptor.forClass(JobRequest.class);
        verify(jobRequestRepository).save(saved.capture());
        assertEquals("pin-hash", saved.getValue().getConfirmationPinHash());
        assertEquals(1, saved.getValue().getTasks().size());
        assertEquals(JobStatus.PROPOSED, response.getStatus());
        assertEquals(clientId, response.getClientId());
        assertEquals(professionalId, response.getProfessionalId());
        assertEquals("Plomería", response.getTasks().getFirst().getTradeName());
        assertTrue(response.getConfirmationPin().matches("\\d{6}"));
        // A new request waits for the professional: it may be the one that reaches the reminder
        verify(events).publishEvent(new JobRequestEvents.AwaitingAnswersChanged(Set.of(clientId, professionalId)));
    }

    @Test
    void createJobRequest_withAPoint_tellsWhetherTheProfessionalsAreaReachesIt() {
        professional.setServiceArea(new ServiceArea(-34.9058, -56.1913, 10)); // Plaza Independencia, 10 km
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(tradeRepository.findById(3L)).thenReturn(Optional.of(Trade.builder().id(3L).name("Plomería").build()));
        when(passwordEncoder.encode(anyString())).thenReturn("pin-hash");
        JobRequestCreateRequest carrasco = createRequest(3L); // ~12.4 km away
        carrasco.setLatitude(-34.8838);
        carrasco.setLongitude(-56.0581);
        JobRequestCreateRequest cordon = createRequest(3L); // ~2 km away
        cordon.setLatitude(-34.9011);
        cordon.setLongitude(-56.1700);

        JobRequestResponse outside = service.createJobRequest(carrasco, clientId);
        assertEquals(true, outside.getOutsideServiceArea());
        assertEquals(-34.8838, outside.getLatitude());
        // The professional's centre goes rounded, as on their public profile.
        assertEquals(new ServiceAreaResponse(-34.91, -56.19, 10), outside.getProfessionalServiceArea());
        assertEquals(false, service.createJobRequest(cordon, clientId).getOutsideServiceArea());
        assertNull(service.createJobRequest(createRequest(3L), clientId).getOutsideServiceArea());
    }

    @Test
    void createJobRequest_withHalfAPoint_isRejected() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        JobRequestCreateRequest request = createRequest(3L);
        request.setLatitude(-34.9);

        assertThrows(ResponseStatusException.class, () -> service.createJobRequest(request, clientId));
        verify(jobRequestRepository, never()).save(any());
    }

    @Test
    void createJobRequest_byAProfessional_isTheClientOfThatJob() {
        UUID otherProfessionalId = UUID.randomUUID();
        Professional requester = Professional.builder().id(4L).publicId(otherProfessionalId).name("Carla")
                .email("carla@example.com").phoneNumber("099654321").build();
        when(clientRepository.findByPublicId(otherProfessionalId)).thenReturn(Optional.of(requester));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(tradeRepository.findById(3L)).thenReturn(Optional.of(Trade.builder().id(3L).name("Plomería").build()));
        when(passwordEncoder.encode(anyString())).thenReturn("pin-hash");

        JobRequestResponse response = service.createJobRequest(createRequest(3L), otherProfessionalId);

        assertEquals(otherProfessionalId, response.getClientId());
        assertEquals(professionalId, response.getProfessionalId());
    }

    @Test
    void createJobRequest_toThemselves_isRejected() {
        when(clientRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        JobRequestCreateRequest request = createRequest(3L);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.createJobRequest(request, professionalId));

        assertEquals(400, e.getStatusCode().value());
        verify(jobRequestRepository, never()).save(any());
    }

    @Test
    void createJobRequest_unknownClient_isRejected() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.empty());
        JobRequestCreateRequest request = createRequest(3L);

        assertThrows(ClientNotFoundException.class, () -> service.createJobRequest(request, clientId));
    }

    @Test
    void createJobRequest_unknownProfessional_isRejected() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.empty());
        JobRequestCreateRequest request = createRequest(3L);

        assertThrows(ClientNotFoundException.class, () -> service.createJobRequest(request, clientId));
    }

    @Test
    void createJobRequest_unknownTrade_isRejected() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(tradeRepository.findById(99L)).thenReturn(Optional.empty());
        JobRequestCreateRequest request = createRequest(99L);

        assertThrows(TradeNotFoundException.class, () -> service.createJobRequest(request, clientId));
        verify(jobRequestRepository, never()).save(any());
    }

    // --- accept / reject ---

    @Test
    void acceptJobRequest_blocksTheAgendaAndMovesToAccepted() {
        JobRequest job = job(JobStatus.PROPOSED);
        JobRequestAcceptRequest request = new JobRequestAcceptRequest();
        OffsetDateTime start = OffsetDateTime.now().plusDays(1);
        request.setStartTimestamp(start);
        request.setEndTimestamp(start.plusHours(2));

        job.setProposedStart(start.minusDays(1));
        job.setProposedEnd(start.minusDays(1).plusHours(2));

        JobRequestResponse response = service.acceptJobRequest(10L, request, professionalId);

        verify(scheduleService).createJobSchedule(job, start, start.plusHours(2));
        assertEquals(JobStatus.ACCEPTED, response.getStatus());
        // The professional's timeframe wins over the one the client asked for, which is no longer pending
        assertNull(job.getProposedStart());
    }

    @Test
    void acceptJobRequest_inThePast_isRejectedWithoutTouchingTheAgenda() {
        job(JobStatus.PROPOSED);
        JobRequestAcceptRequest request = new JobRequestAcceptRequest();
        OffsetDateTime start = OffsetDateTime.now().minusHours(1);
        request.setStartTimestamp(start);
        request.setEndTimestamp(start.plusHours(2));

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.acceptJobRequest(10L, request, professionalId));
        assertEquals(400, e.getStatusCode().value());
        verify(scheduleService, never()).createJobSchedule(any(), any(), any());
    }

    @Test
    void acceptJobRequest_notProposed_isRejected() {
        job(JobStatus.CANCELLED);
        JobRequestAcceptRequest request = new JobRequestAcceptRequest();

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.acceptJobRequest(10L, request, professionalId));
        assertEquals(400, e.getStatusCode().value());
    }

    @Test
    void acceptJobRequest_byAnotherProfessional_isForbidden() {
        job(JobStatus.PROPOSED);
        JobRequestAcceptRequest request = new JobRequestAcceptRequest();

        assertThrows(AccessDeniedException.class, () -> service.acceptJobRequest(10L, request, strangerId));
    }

    @Test
    void acceptJobRequest_unknownJob_isNotFound() {
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.empty());
        JobRequestAcceptRequest request = new JobRequestAcceptRequest();

        assertThrows(JobRequestNotFoundException.class, () -> service.acceptJobRequest(10L, request, professionalId));
    }

    @Test
    void rejectJobRequest_movesToRejected() {
        job(JobStatus.PROPOSED);

        JobRequestResponse response = service.rejectJobRequest(10L, null, professionalId);

        assertEquals(JobStatus.REJECTED, response.getStatus());
        assertNull(response.getRejectionReason());
    }

    @Test
    void rejectJobRequest_keepsTheReason() {
        job(JobStatus.PROPOSED);
        JobRequestRejectRequest request = new JobRequestRejectRequest();
        request.setReason("  No trabajo en esa zona  ");

        assertEquals("No trabajo en esa zona",
                service.rejectJobRequest(10L, request, professionalId).getRejectionReason());
    }

    @Test
    void rejectJobRequest_notProposed_isRejected() {
        job(JobStatus.ACCEPTED);

        assertThrows(ResponseStatusException.class, () -> service.rejectJobRequest(10L, null, professionalId));
    }

    // --- cancel ---

    private JobRequestCancelRequest cancelReason(String reason) {
        JobRequestCancelRequest request = new JobRequestCancelRequest();
        request.setReason(reason);
        return request;
    }

    @Test
    void cancelJobRequest_proposed_byTheClient_isCancelledWithoutTouchingTheAgenda() {
        JobRequest job = job(JobStatus.PROPOSED);

        JobRequestResponse response = service.cancelJobRequest(10L, cancelReason("Ya lo arreglé"), clientId);

        assertEquals(JobStatus.CANCELLED, response.getStatus());
        assertEquals(Role.CLIENT, response.getCancelledBy());
        assertEquals("Ya lo arreglé", response.getCancellationReason());
        verify(scheduleService, never()).releaseJobSchedule(job);
    }

    @Test
    void cancelJobRequest_accepted_byTheProfessional_releasesTheAgenda() {
        JobRequest job = scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));

        JobRequestResponse response = service.cancelJobRequest(10L, null, professionalId);

        assertEquals(JobStatus.CANCELLED, response.getStatus());
        assertEquals(Role.PROFESSIONAL, response.getCancelledBy());
        assertNull(response.getCancellationReason());
        verify(scheduleService).releaseJobSchedule(job);
    }

    @Test
    void cancelJobRequest_withPendingReschedule_releasesTheAgendaAndDropsTheProposal() {
        JobRequest job = scheduledJob(JobStatus.RESCHEDULE_REQUESTED, OffsetDateTime.now().plusDays(3));
        job.setRescheduleStart(OffsetDateTime.now().plusDays(5));
        job.setRescheduleEnd(OffsetDateTime.now().plusDays(5).plusHours(2));

        JobRequestResponse response = service.cancelJobRequest(10L, null, clientId);

        assertEquals(JobStatus.CANCELLED, response.getStatus());
        assertNull(response.getRescheduleStart());
        verify(scheduleService).releaseJobSchedule(job);
    }

    @Test
    void cancelJobRequest_accepted_withLessThanTheNotice_isRejected() {
        JobRequest job = scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusHours(5));

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.cancelJobRequest(10L, null, clientId));
        assertEquals(400, e.getStatusCode().value());
        assertEquals(JobStatus.ACCEPTED, job.getStatus());
        verify(scheduleService, never()).releaseJobSchedule(any());
    }

    @Test
    void cancelJobRequest_accepted_afterItStarted_isRejected() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().minusHours(1));

        assertThrows(ResponseStatusException.class, () -> service.cancelJobRequest(10L, null, professionalId));
    }

    @Test
    void cancelJobRequest_withARetainedPayment_refundsIt() {
        JobRequest job = scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        job.setPaymentState(PaymentState.RETAINED);

        assertEquals(PaymentState.REFUNDED, service.cancelJobRequest(10L, null, clientId).getPaymentState());
    }

    @Test
    void cancelJobRequest_byAStranger_isForbidden() {
        job(JobStatus.PROPOSED);

        assertThrows(AccessDeniedException.class, () -> service.cancelJobRequest(10L, null, strangerId));
    }

    @Test
    void cancelJobRequest_completed_isRejected() {
        job(JobStatus.COMPLETED);

        assertThrows(ResponseStatusException.class, () -> service.cancelJobRequest(10L, null, clientId));
    }

    @Test
    void cancelJobRequest_unknownJob_isNotFound() {
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.empty());

        assertThrows(JobRequestNotFoundException.class, () -> service.cancelJobRequest(10L, null, clientId));
    }

    // --- reschedule ---

    private JobRequestRescheduleRequest reschedule(OffsetDateTime start) {
        JobRequestRescheduleRequest request = new JobRequestRescheduleRequest();
        request.setStartTimestamp(start);
        request.setEndTimestamp(start.plusHours(2));
        return request;
    }

    @Test
    void requestReschedule_byTheClient_keepsTheProposalUntilTheProfessionalAnswers() {
        JobRequest job = scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        OffsetDateTime newStart = OffsetDateTime.now().plusDays(5);

        JobRequestResponse response = service.requestReschedule(10L, reschedule(newStart), clientId);

        assertEquals(JobStatus.RESCHEDULE_REQUESTED, response.getStatus());
        assertEquals(newStart, response.getRescheduleStart());
        assertEquals(newStart.plusHours(2), response.getRescheduleEnd());
        assertEquals(Role.CLIENT, response.getRescheduleRequestedBy());
        verify(scheduleService).checkJobSlotAvailable(job, newStart, newStart.plusHours(2));
        verify(scheduleService, never()).moveJobSchedule(any(), any(), any());
    }

    @Test
    void requestReschedule_byTheProfessional_isTheirProposalForTheClientToAnswer() {
        JobRequest job = scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        OffsetDateTime newStart = OffsetDateTime.now().plusDays(5);

        JobRequestResponse response = service.requestReschedule(10L, reschedule(newStart), professionalId);

        assertEquals(JobStatus.RESCHEDULE_REQUESTED, response.getStatus());
        assertEquals(Role.PROFESSIONAL, response.getRescheduleRequestedBy());
        verify(scheduleService).checkJobSlotAvailable(job, newStart, newStart.plusHours(2));
    }

    @Test
    void requestReschedule_bySomeoneOutsideTheJob_isForbidden() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        JobRequestRescheduleRequest request = reschedule(OffsetDateTime.now().plusDays(5));

        assertThrows(AccessDeniedException.class, () -> service.requestReschedule(10L, request, strangerId));
    }

    @Test
    void requestReschedule_byTheProfessional_withLessThanTheNotice_isRejectedToo() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusHours(5));
        JobRequestRescheduleRequest request = reschedule(OffsetDateTime.now().plusDays(5));

        assertThrows(ResponseStatusException.class, () -> service.requestReschedule(10L, request, professionalId));
    }

    @Test
    void requestReschedule_notAccepted_isRejected() {
        job(JobStatus.PROPOSED);
        JobRequestRescheduleRequest request = reschedule(OffsetDateTime.now().plusDays(5));

        assertThrows(ResponseStatusException.class, () -> service.requestReschedule(10L, request, clientId));
    }

    @Test
    void requestReschedule_toThePast_isRejected() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        JobRequestRescheduleRequest request = reschedule(OffsetDateTime.now().minusDays(1));

        assertThrows(ResponseStatusException.class, () -> service.requestReschedule(10L, request, clientId));
    }

    @Test
    void requestReschedule_toTheSameTimeframe_isRejected() {
        OffsetDateTime start = OffsetDateTime.now().plusDays(3);
        scheduledJob(JobStatus.ACCEPTED, start);
        JobRequestRescheduleRequest request = reschedule(start);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.requestReschedule(10L, request, clientId));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verify(scheduleService, never()).checkJobSlotAvailable(any(), any(), any());
    }

    @Test
    void requestReschedule_withLessThanTheNotice_isRejected() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusHours(5));
        JobRequestRescheduleRequest request = reschedule(OffsetDateTime.now().plusDays(5));

        assertThrows(ResponseStatusException.class, () -> service.requestReschedule(10L, request, clientId));
    }

    @Test
    void requestReschedule_toATakenSlot_isAConflictAndChangesNothing() {
        JobRequest job = scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        JobRequestRescheduleRequest request = reschedule(OffsetDateTime.now().plusDays(5));
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT))
                .when(scheduleService).checkJobSlotAvailable(any(), any(), any());

        assertThrows(ResponseStatusException.class, () -> service.requestReschedule(10L, request, clientId));
        assertEquals(JobStatus.ACCEPTED, job.getStatus());
        assertNull(job.getRescheduleStart());
    }

    /** A pending reschedule asked for by {@code requestedBy}; null is one from before either side could ask. */
    private JobRequest pendingReschedule(Role requestedBy, OffsetDateTime newStart) {
        JobRequest job = scheduledJob(JobStatus.RESCHEDULE_REQUESTED, OffsetDateTime.now().plusDays(3));
        job.setRescheduleStart(newStart);
        job.setRescheduleEnd(newStart.plusHours(2));
        job.setRescheduleRequestedBy(requestedBy);
        return job;
    }

    @Test
    void acceptReschedule_movesTheAgendaBlockAndGoesBackToAccepted() {
        OffsetDateTime newStart = OffsetDateTime.now().plusDays(5);
        JobRequest job = pendingReschedule(Role.CLIENT, newStart);

        JobRequestResponse response = service.acceptReschedule(10L, professionalId);

        verify(scheduleService).moveJobSchedule(job, newStart, newStart.plusHours(2));
        assertEquals(JobStatus.ACCEPTED, response.getStatus());
        assertNull(response.getRescheduleStart());
        assertNull(response.getRescheduleRequestedBy());
    }

    @Test
    void acceptReschedule_ofTheProfessionalsProposal_isTheClientsToAnswer() {
        OffsetDateTime newStart = OffsetDateTime.now().plusDays(5);
        JobRequest job = pendingReschedule(Role.PROFESSIONAL, newStart);

        JobRequestResponse response = service.acceptReschedule(10L, clientId);

        verify(scheduleService).moveJobSchedule(job, newStart, newStart.plusHours(2));
        assertEquals(JobStatus.ACCEPTED, response.getStatus());
    }

    @Test
    void answeringYourOwnReschedule_isForbidden_whicheverSideAskedForIt() {
        pendingReschedule(Role.PROFESSIONAL, OffsetDateTime.now().plusDays(5));
        assertThrows(AccessDeniedException.class, () -> service.acceptReschedule(10L, professionalId));
        assertThrows(AccessDeniedException.class, () -> service.rejectReschedule(10L, professionalId));

        pendingReschedule(Role.CLIENT, OffsetDateTime.now().plusDays(5));
        assertThrows(AccessDeniedException.class, () -> service.acceptReschedule(10L, clientId));
        assertThrows(AccessDeniedException.class, () -> service.rejectReschedule(10L, clientId));
        verify(scheduleService, never()).moveJobSchedule(any(), any(), any());
    }

    @Test
    void aRescheduleFromBeforeEitherSideCouldAsk_isTheClients_soTheProfessionalAnswersIt() {
        OffsetDateTime newStart = OffsetDateTime.now().plusDays(5);
        JobRequest job = pendingReschedule(null, newStart);

        assertThrows(AccessDeniedException.class, () -> service.acceptReschedule(10L, clientId));
        service.acceptReschedule(10L, professionalId);

        verify(scheduleService).moveJobSchedule(job, newStart, newStart.plusHours(2));
    }

    @Test
    void answeringAReschedule_bySomeoneOutsideTheJob_isForbidden() {
        pendingReschedule(Role.CLIENT, OffsetDateTime.now().plusDays(5));

        assertThrows(AccessDeniedException.class, () -> service.acceptReschedule(10L, strangerId));
        assertThrows(AccessDeniedException.class, () -> service.rejectReschedule(10L, strangerId));
    }

    @Test
    void acceptReschedule_whenTheProposedTimeAlreadyPassed_isRejected() {
        JobRequest job = scheduledJob(JobStatus.RESCHEDULE_REQUESTED, OffsetDateTime.now().plusDays(3));
        job.setRescheduleStart(OffsetDateTime.now().minusHours(1));
        job.setRescheduleEnd(OffsetDateTime.now().plusHours(1));

        assertThrows(ResponseStatusException.class, () -> service.acceptReschedule(10L, professionalId));
        verify(scheduleService, never()).moveJobSchedule(any(), any(), any());
    }

    @Test
    void acceptReschedule_withoutAPendingRequest_isRejected() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));

        assertThrows(ResponseStatusException.class, () -> service.acceptReschedule(10L, professionalId));
    }

    @Test
    void rejectReschedule_keepsTheOriginalTime() {
        OffsetDateTime start = OffsetDateTime.now().plusDays(3);
        JobRequest job = scheduledJob(JobStatus.RESCHEDULE_REQUESTED, start);
        job.setRescheduleStart(OffsetDateTime.now().plusDays(5));
        job.setRescheduleEnd(OffsetDateTime.now().plusDays(5).plusHours(2));
        job.setRescheduleRequestedBy(Role.PROFESSIONAL);

        JobRequestResponse response = service.rejectReschedule(10L, clientId);

        assertEquals(JobStatus.ACCEPTED, response.getStatus());
        assertEquals(start, response.getScheduledStart());
        assertNull(response.getRescheduleStart());
        assertNull(response.getRescheduleRequestedBy());
        verify(scheduleService, never()).moveJobSchedule(any(), any(), any());
    }

    @Test
    void rejectReschedule_withoutAPendingRequest_isRejected() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));

        assertThrows(ResponseStatusException.class, () -> service.rejectReschedule(10L, professionalId));
    }

    // --- events for the emails ---

    @Test
    void requestReschedule_tellsTheOtherSide_andThatWhatWaitsForBothMayHaveChanged() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));

        service.requestReschedule(10L, reschedule(OffsetDateTime.now().plusDays(5)), clientId);

        verify(events).publishEvent(new JobRequestEvents.RescheduleRequested(10L));
        verify(events).publishEvent(new JobRequestEvents.AwaitingAnswersChanged(Set.of(clientId, professionalId)));
    }

    @Test
    void everyAnswer_letsWhatWaitsBeCountedAgain_soTheReminderCanBeSentAgainLater() {
        pendingReschedule(Role.CLIENT, OffsetDateTime.now().plusDays(5));

        service.rejectReschedule(10L, professionalId);

        verify(events).publishEvent(new JobRequestEvents.AwaitingAnswersChanged(Set.of(clientId, professionalId)));
        verify(events, never()).publishEvent(any(JobRequestEvents.RescheduleRequested.class));
    }

    @Test
    void aRefusedAction_publishesNothing() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        JobRequestRescheduleRequest request = reschedule(OffsetDateTime.now().plusDays(5));

        assertThrows(AccessDeniedException.class, () -> service.requestReschedule(10L, request, strangerId));

        verify(events, never()).publishEvent(any());
    }

    // --- complete ---

    private JobRequestCompleteRequest pin(String pin) {
        JobRequestCompleteRequest request = new JobRequestCompleteRequest();
        request.setPin(pin);
        return request;
    }

    @Test
    void completeJobRequest_withTheRightPin_movesToCompleted() {
        job(JobStatus.ACCEPTED);
        when(passwordEncoder.matches("123456", "hash")).thenReturn(true);

        assertEquals(JobStatus.COMPLETED, service.completeJobRequest(10L, pin("123456"), professionalId).getStatus());
    }

    @Test
    void completeJobRequest_withAPendingReschedule_stillWorksAtTheOriginalTime() {
        JobRequest job = job(JobStatus.RESCHEDULE_REQUESTED);
        job.setRescheduleStart(OffsetDateTime.now().plusDays(5));
        when(passwordEncoder.matches("123456", "hash")).thenReturn(true);

        JobRequestResponse response = service.completeJobRequest(10L, pin("123456"), professionalId);

        assertEquals(JobStatus.COMPLETED, response.getStatus());
        assertNull(response.getRescheduleStart());
    }

    @Test
    void completeJobRequest_withAWrongPin_isRejected() {
        JobRequest job = job(JobStatus.ACCEPTED);
        when(passwordEncoder.matches("000000", "hash")).thenReturn(false);
        JobRequestCompleteRequest request = pin("000000");

        assertThrows(ResponseStatusException.class, () -> service.completeJobRequest(10L, request, professionalId));
        assertEquals(JobStatus.ACCEPTED, job.getStatus());
    }

    @Test
    void completeJobRequest_notAccepted_isRejected() {
        job(JobStatus.PROPOSED);
        JobRequestCompleteRequest request = pin("123456");

        assertThrows(ResponseStatusException.class, () -> service.completeJobRequest(10L, request, professionalId));
    }

    // --- review ---

    private JobRequestReviewRequest review(int rating, String text) {
        JobRequestReviewRequest request = new JobRequestReviewRequest();
        request.setRating(rating);
        request.setReview(text);
        return request;
    }

    @Test
    void reviewJobRequest_savesTheReviewAndRecalculatesTheProfessionalRating() {
        job(JobStatus.COMPLETED);
        when(jobRequestRepository.averageRatingOf(professionalId)).thenReturn(8.5);

        JobRequestResponse response = service.reviewJobRequest(10L, review(9, "  Excelente  "), clientId);

        assertEquals(9, response.getRating());
        assertEquals("Excelente", response.getReview());
        assertEquals(8.5, professional.getRating());
        verify(professionalRepository).save(professional);
    }

    @Test
    void getProfessionalReviews_mapsEachReviewedJob() {
        JobRequest job = job(JobStatus.COMPLETED);
        job.setRating(9);
        job.setReview("Excelente");
        when(jobRequestRepository.findReviewsOfProfessional(professionalId, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(job)));

        ReviewResponse review = service.getProfessionalReviews(professionalId, PageRequest.of(0, 20)).getContent().getFirst();

        assertEquals(10L, review.getJobRequestId());
        assertEquals("Ana", review.getClientName());
        assertEquals(professionalId, review.getProfessionalId());
        assertEquals(9, review.getRating());
        assertEquals("Excelente", review.getReview());
    }

    @Test
    void getMyReviews_areTheClientsReviewedJobs() {
        JobRequest job = job(JobStatus.COMPLETED);
        job.setRating(7);
        when(jobRequestRepository.findReviewsByClient(clientId, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(job)));

        assertEquals(7, service.getMyReviews(clientId, PageRequest.of(0, 20)).getContent().getFirst().getRating());
    }

    @Test
    void getMyReviews_capsThePageSize() {
        when(jobRequestRepository.findReviewsByClient(clientId, PageRequest.of(0, JobRequestServiceImpl.MAX_REVIEW_PAGE_SIZE)))
                .thenReturn(Page.empty());

        service.getMyReviews(clientId, PageRequest.of(0, 500));

        verify(jobRequestRepository).findReviewsByClient(clientId, PageRequest.of(0, JobRequestServiceImpl.MAX_REVIEW_PAGE_SIZE));
    }

    @Test
    void reviewJobRequest_blankText_isStoredAsNoReview() {
        job(JobStatus.COMPLETED);

        assertNull(service.reviewJobRequest(10L, review(7, "   "), clientId).getReview());
    }

    @Test
    void reviewJobRequest_withoutText_isStoredAsNoReview() {
        job(JobStatus.COMPLETED);

        assertNull(service.reviewJobRequest(10L, review(7, null), clientId).getReview());
    }

    @Test
    void reviewJobRequest_byTheProfessional_isForbidden() {
        job(JobStatus.COMPLETED);
        JobRequestReviewRequest request = review(9, null);

        assertThrows(AccessDeniedException.class, () -> service.reviewJobRequest(10L, request, professionalId));
    }

    @Test
    void reviewJobRequest_notCompleted_isRejected() {
        job(JobStatus.ACCEPTED);
        JobRequestReviewRequest request = review(9, null);

        assertThrows(ResponseStatusException.class, () -> service.reviewJobRequest(10L, request, clientId));
    }

    @Test
    void reviewJobRequest_twice_isAConflict() {
        job(JobStatus.COMPLETED).setRating(5);
        JobRequestReviewRequest request = review(9, null);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.reviewJobRequest(10L, request, clientId));
        assertEquals(409, e.getStatusCode().value());
    }

    @Test
    void reviewJobRequest_unknownJob_isNotFound() {
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.empty());
        JobRequestReviewRequest request = review(9, null);

        assertThrows(JobRequestNotFoundException.class, () -> service.reviewJobRequest(10L, request, clientId));
    }

    // --- queries ---

    @Test
    void getJobRequest_participant_seesItWithTheScheduledTimeframe() {
        JobRequest job = job(JobStatus.ACCEPTED);
        OffsetDateTime start = OffsetDateTime.now().plusDays(2);
        job.getSchedules().add(Schedule.builder().type(ScheduleType.SCHEDULED_JOB)
                .startTimestamp(start).endTimestamp(start.plusHours(3)).build());

        JobRequestResponse response = service.getJobRequest(10L, professionalId);

        assertEquals(start, response.getScheduledStart());
        assertEquals(start.plusHours(3), response.getScheduledEnd());
    }

    @Test
    void getJobRequest_showsWhoTakesPart_andTheirContactOnlyOnceAccepted() {
        job(JobStatus.PROPOSED);

        JobRequestResponse proposed = service.getJobRequest(10L, professionalId);

        assertEquals("Ana", proposed.getClientName());
        assertEquals("Beto", proposed.getProfessionalName());
        assertNull(proposed.getClientEmail());
        assertNull(proposed.getProfessionalPhoneNumber());

        job(JobStatus.ACCEPTED);

        JobRequestResponse accepted = service.getJobRequest(10L, professionalId);

        assertEquals("ana@example.com", accepted.getClientEmail());
        assertEquals("099123456", accepted.getProfessionalPhoneNumber());
    }

    @Test
    void getJobRequest_stranger_isForbidden() {
        job(JobStatus.PROPOSED);

        assertThrows(AccessDeniedException.class, () -> service.getJobRequest(10L, strangerId));
    }

    @Test
    void getJobRequest_unknownJob_isNotFound() {
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.empty());

        assertThrows(JobRequestNotFoundException.class, () -> service.getJobRequest(10L, clientId));
    }

    @Test
    void getMyJobRequests_andListAll_mapEveryJob() {
        JobRequest job = job(JobStatus.PROPOSED);
        when(jobRequestRepository.findByParticipant(clientId)).thenReturn(List.of(job));
        when(jobRequestRepository.findAll()).thenReturn(List.of(job, job));

        assertEquals(1, service.getMyJobRequests(clientId, null).size());
        assertEquals(2, service.listAllJobRequests().size());
    }

    @Test
    void getMyJobRequests_withAStatus_onlyAsksForThatStatus() {
        JobRequest job = job(JobStatus.PROPOSED);
        when(jobRequestRepository.findByParticipantAndStatus(professionalId, JobStatus.PROPOSED)).thenReturn(List.of(job));

        assertEquals(1, service.getMyJobRequests(professionalId, JobStatus.PROPOSED).size());
        verify(jobRequestRepository, never()).findByParticipant(any());
    }

    // --- proposals from either side ---

    private final OffsetDateTime proposedStart = OffsetDateTime.now().plusDays(3);

    /** A professional's proposal to the client, with the trade stubbed and the pair already talking. */
    private JobRequestCreateRequest professionalProposal() {
        JobRequestCreateRequest request = createRequest(3L);
        request.setProfessionalId(null);
        request.setClientId(clientId);
        request.setStartTimestamp(proposedStart);
        request.setEndTimestamp(proposedStart.plusHours(2));
        when(tradeRepository.findById(3L)).thenReturn(Optional.of(Trade.builder().id(3L).name("Plomería").build()));
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(conversationRepository.findBetween(1L, 2L)).thenReturn(Optional.of(
                Conversation.builder().id(12L).client(client).professional(professional).build()));
        return request;
    }

    private JobRequest proposedByProfessional() {
        JobRequest job = job(JobStatus.PROPOSED);
        job.setProposedBy(Role.PROFESSIONAL);
        job.setConfirmationPinHash(null);
        job.setProposedStart(proposedStart);
        job.setProposedEnd(proposedStart.plusHours(2));
        return job;
    }

    @Test
    void createJobRequest_byAProfessional_keepsTheTimeframeWithoutPinAndLeavesItsCard() {
        JobRequestResponse response = service.createJobRequest(professionalProposal(), professionalId);

        ArgumentCaptor<JobRequest> saved = ArgumentCaptor.forClass(JobRequest.class);
        verify(jobRequestRepository).save(saved.capture());
        assertEquals(Role.PROFESSIONAL, saved.getValue().getProposedBy());
        assertNull(saved.getValue().getConfirmationPinHash());
        assertEquals(proposedStart, saved.getValue().getProposedStart());
        assertNull(response.getConfirmationPin());
        assertEquals(Role.PROFESSIONAL, response.getProposedBy());
        verify(scheduleService).checkJobSlotAvailable(any(), any(), any());
        verify(events).publishEvent(any(JobRequestEvents.JobProposed.class));
    }

    @Test
    void createJobRequest_byAClient_isProposedByTheClientWithItsPin() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(tradeRepository.findById(3L)).thenReturn(Optional.of(Trade.builder().id(3L).name("Plomería").build()));
        when(passwordEncoder.encode(anyString())).thenReturn("pin-hash");

        JobRequestResponse response = service.createJobRequest(createRequest(3L), clientId);

        assertEquals(Role.CLIENT, response.getProposedBy());
        assertEquals(6, response.getConfirmationPin().length());
        verify(events).publishEvent(any(JobRequestEvents.JobProposed.class));
    }

    @Test
    void createJobRequest_byAClient_keepsTheTimeframeTheyAskedFor() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        when(tradeRepository.findById(3L)).thenReturn(Optional.of(Trade.builder().id(3L).name("Plomería").build()));
        when(passwordEncoder.encode(anyString())).thenReturn("pin-hash");
        JobRequestCreateRequest request = createRequest(3L);
        OffsetDateTime start = OffsetDateTime.now().plusDays(1);
        request.setStartTimestamp(start);
        request.setEndTimestamp(start.plusHours(2));

        JobRequestResponse response = service.createJobRequest(request, clientId);

        assertEquals(start, response.getProposedStart());
        assertEquals(start.plusHours(2), response.getProposedEnd());
        // Only a wish: the professional's agenda is checked when they accept
        verify(scheduleService, never()).checkJobSlotAvailable(any(), any(), any());
    }

    @Test
    void createJobRequest_byAClient_withAnInvalidTimeframe_isABadRequest() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
        OffsetDateTime start = OffsetDateTime.now().plusDays(1);
        JobRequestCreateRequest onlyStart = createRequest(3L);
        onlyStart.setStartTimestamp(start);
        JobRequestCreateRequest inverted = createRequest(3L);
        inverted.setStartTimestamp(start);
        inverted.setEndTimestamp(start.minusHours(1));
        JobRequestCreateRequest past = createRequest(3L);
        past.setStartTimestamp(OffsetDateTime.now().minusDays(1));
        past.setEndTimestamp(OffsetDateTime.now().minusDays(1).plusHours(2));

        for (JobRequestCreateRequest request : List.of(onlyStart, inverted, past)) {
            ResponseStatusException e = assertThrows(ResponseStatusException.class,
                    () -> service.createJobRequest(request, clientId));
            assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        }
        verify(jobRequestRepository, never()).save(any());
    }

    @Test
    void createJobRequest_byAProfessionalWithoutAConversation_isForbidden() {
        JobRequestCreateRequest request = professionalProposal();
        when(conversationRepository.findBetween(1L, 2L)).thenReturn(Optional.empty());

        assertThrows(AccessDeniedException.class, () -> service.createJobRequest(request, professionalId));
        verify(jobRequestRepository, never()).save(any());
    }

    @Test
    void createJobRequest_withClientIdBySomeoneWhoIsNotAProfessional_isForbidden() {
        JobRequestCreateRequest request = professionalProposal();

        assertThrows(AccessDeniedException.class, () -> service.createJobRequest(request, strangerId));
    }

    @Test
    void createJobRequest_byAProfessionalWithoutATimeframe_isABadRequest() {
        JobRequestCreateRequest request = professionalProposal();
        request.setEndTimestamp(null);

        assertThrows(ResponseStatusException.class, () -> service.createJobRequest(request, professionalId));
        verify(jobRequestRepository, never()).save(any());
    }

    @Test
    void createJobRequest_byAProfessionalInThePast_isABadRequest() {
        JobRequestCreateRequest request = professionalProposal();
        request.setStartTimestamp(OffsetDateTime.now().minusHours(1));

        assertThrows(ResponseStatusException.class, () -> service.createJobRequest(request, professionalId));
    }

    @Test
    void createJobRequest_byAClientWithATimeframe_isABadRequest() {
        JobRequestCreateRequest request = createRequest(3L);
        request.setStartTimestamp(proposedStart);
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));

        assertThrows(ResponseStatusException.class, () -> service.createJobRequest(request, clientId));
    }

    @Test
    void createJobRequest_withBothOrNeitherSide_isABadRequest() {
        JobRequestCreateRequest both = createRequest(3L);
        both.setClientId(clientId);
        JobRequestCreateRequest neither = createRequest(3L);
        neither.setProfessionalId(null);

        assertThrows(ResponseStatusException.class, () -> service.createJobRequest(both, clientId));
        assertThrows(ResponseStatusException.class, () -> service.createJobRequest(neither, clientId));
    }

    @Test
    void createJobRequest_inABlockedConversation_isForbiddenInEitherDirection() {
        JobRequestCreateRequest request = professionalProposal();
        Conversation blocked = Conversation.builder().id(12L).client(client).professional(professional)
                .clientBlockedAt(OffsetDateTime.now()).build();
        when(conversationRepository.findBetween(1L, 2L)).thenReturn(Optional.of(blocked));

        assertThrows(AccessDeniedException.class, () -> service.createJobRequest(request, professionalId));
        assertThrows(AccessDeniedException.class, () -> service.createJobRequest(createRequest(3L), clientId));
        verify(jobRequestRepository, never()).save(any());
    }

    @Test
    void acceptJobRequest_theClientAcceptsAProfessionalsProposal_atItsTimeframe_andGetsThePinOnce() {
        JobRequest job = proposedByProfessional();
        when(passwordEncoder.encode(anyString())).thenReturn("pin-hash");

        JobRequestResponse response = service.acceptJobRequest(10L, null, clientId);

        verify(scheduleService).createJobSchedule(job, proposedStart, proposedStart.plusHours(2));
        assertEquals(JobStatus.ACCEPTED, job.getStatus());
        assertEquals("pin-hash", job.getConfirmationPinHash());
        assertEquals(6, response.getConfirmationPin().length());
        assertNull(job.getProposedStart());
        assertNull(job.getProposedEnd());
        verify(events).publishEvent(new JobRequestEvents.JobStatusChanged(10L, JobRequestEvents.Change.ACCEPTED, clientId));
    }

    @Test
    void acceptJobRequest_theClientCantChangeTheProfessionalsTimeframe() {
        proposedByProfessional();
        JobRequestAcceptRequest request = new JobRequestAcceptRequest();
        request.setStartTimestamp(proposedStart.plusDays(1));
        request.setEndTimestamp(proposedStart.plusDays(1).plusHours(2));

        assertThrows(ResponseStatusException.class, () -> service.acceptJobRequest(10L, request, clientId));
        verify(scheduleService, never()).createJobSchedule(any(), any(), any());
    }

    @Test
    void acceptJobRequest_whenTheProposedSlotWasTakenMeanwhile_failsAndStaysProposed() {
        JobRequest job = proposedByProfessional();
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT)).when(scheduleService).createJobSchedule(any(), any(), any());

        assertThrows(ResponseStatusException.class, () -> service.acceptJobRequest(10L, null, clientId));
        assertEquals(JobStatus.PROPOSED, job.getStatus());
        assertNull(job.getConfirmationPinHash());
    }

    @Test
    void acceptJobRequest_aProfessionalsProposalWhoseTimeframePassed_isABadRequest() {
        JobRequest job = proposedByProfessional();
        job.setProposedStart(OffsetDateTime.now().minusHours(1));

        assertThrows(ResponseStatusException.class, () -> service.acceptJobRequest(10L, null, clientId));
    }

    @Test
    void acceptOrRejectJobRequest_byWhoeverProposedIt_isForbidden_butTheyCanCancelIt() {
        proposedByProfessional();

        assertThrows(AccessDeniedException.class, () -> service.acceptJobRequest(10L, null, professionalId));
        assertThrows(AccessDeniedException.class, () -> service.rejectJobRequest(10L, null, professionalId));
        assertEquals(JobStatus.CANCELLED, service.cancelJobRequest(10L, null, professionalId).getStatus());
    }

    @Test
    void acceptOrRejectJobRequest_theClientCantAnswerTheirOwnProposal() {
        job(JobStatus.PROPOSED);

        assertThrows(AccessDeniedException.class, () -> service.acceptJobRequest(10L, null, clientId));
        assertThrows(AccessDeniedException.class, () -> service.rejectJobRequest(10L, null, clientId));
    }

    @Test
    void acceptJobRequest_aClientsProposalWithoutATimeframe_isABadRequest() {
        job(JobStatus.PROPOSED);

        assertThrows(ResponseStatusException.class, () -> service.acceptJobRequest(10L, null, professionalId));
    }

    @Test
    void rejectJobRequest_theClientRejectsAProfessionalsProposal_keepingItsTimeframeForTheCard() {
        JobRequest job = proposedByProfessional();

        service.rejectJobRequest(10L, null, clientId);

        assertEquals(JobStatus.REJECTED, job.getStatus());
        assertEquals(proposedStart, job.getProposedStart());
        verify(events).publishEvent(new JobRequestEvents.JobStatusChanged(10L, JobRequestEvents.Change.REJECTED, clientId));
    }
}
