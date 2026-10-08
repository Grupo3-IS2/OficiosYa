package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCancelRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRejectRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRescheduleRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.request.TaskCreateRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.exception.JobRequestNotFoundException;
import com.um.uy.oficiosya.exception.TradeNotFoundException;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.JobRequestMapperImpl;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
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
                tradeRepository, new JobRequestMapperImpl(), scheduleService, passwordEncoder, Clock.systemUTC(), 24);
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
    }

    @Test
    void createJobRequest_unknownClient_isRejected() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.empty());
        JobRequestCreateRequest request = createRequest(3L);

        assertThrows(UserNotFoundException.class, () -> service.createJobRequest(request, clientId));
    }

    @Test
    void createJobRequest_unknownProfessional_isRejected() {
        when(clientRepository.findByPublicId(clientId)).thenReturn(Optional.of(client));
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.empty());
        JobRequestCreateRequest request = createRequest(3L);

        assertThrows(UserNotFoundException.class, () -> service.createJobRequest(request, clientId));
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

        JobRequestResponse response = service.acceptJobRequest(10L, request, professionalId);

        verify(scheduleService).createJobSchedule(job, start, start.plusHours(2));
        assertEquals(JobStatus.ACCEPTED, response.getStatus());
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
    void requestReschedule_keepsTheProposalUntilTheProfessionalAnswers() {
        JobRequest job = scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        OffsetDateTime newStart = OffsetDateTime.now().plusDays(5);

        JobRequestResponse response = service.requestReschedule(10L, reschedule(newStart), clientId);

        assertEquals(JobStatus.RESCHEDULE_REQUESTED, response.getStatus());
        assertEquals(newStart, response.getRescheduleStart());
        assertEquals(newStart.plusHours(2), response.getRescheduleEnd());
        verify(scheduleService).checkJobSlotAvailable(job, newStart, newStart.plusHours(2));
        verify(scheduleService, never()).moveJobSchedule(any(), any(), any());
    }

    @Test
    void requestReschedule_byTheProfessional_isForbidden() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));
        JobRequestRescheduleRequest request = reschedule(OffsetDateTime.now().plusDays(5));

        assertThrows(AccessDeniedException.class, () -> service.requestReschedule(10L, request, professionalId));
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

    @Test
    void acceptReschedule_movesTheAgendaBlockAndGoesBackToAccepted() {
        JobRequest job = scheduledJob(JobStatus.RESCHEDULE_REQUESTED, OffsetDateTime.now().plusDays(3));
        OffsetDateTime newStart = OffsetDateTime.now().plusDays(5);
        job.setRescheduleStart(newStart);
        job.setRescheduleEnd(newStart.plusHours(2));

        JobRequestResponse response = service.acceptReschedule(10L, professionalId);

        verify(scheduleService).moveJobSchedule(job, newStart, newStart.plusHours(2));
        assertEquals(JobStatus.ACCEPTED, response.getStatus());
        assertNull(response.getRescheduleStart());
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
    void acceptReschedule_byTheClient_isForbidden() {
        scheduledJob(JobStatus.RESCHEDULE_REQUESTED, OffsetDateTime.now().plusDays(3));

        assertThrows(AccessDeniedException.class, () -> service.acceptReschedule(10L, clientId));
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

        JobRequestResponse response = service.rejectReschedule(10L, professionalId);

        assertEquals(JobStatus.ACCEPTED, response.getStatus());
        assertEquals(start, response.getScheduledStart());
        assertNull(response.getRescheduleStart());
        verify(scheduleService, never()).moveJobSchedule(any(), any(), any());
    }

    @Test
    void rejectReschedule_withoutAPendingRequest_isRejected() {
        scheduledJob(JobStatus.ACCEPTED, OffsetDateTime.now().plusDays(3));

        assertThrows(ResponseStatusException.class, () -> service.rejectReschedule(10L, professionalId));
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
}
