package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.request.TaskCreateRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Professional;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The job lifecycle: PROPOSED → ACCEPTED → COMPLETED → reviewed, plus reject and cancel, and who may do each. */
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
                tradeRepository, new JobRequestMapperImpl(), scheduleService, passwordEncoder);
        client = Client.builder().id(1L).publicId(clientId).name("Ana").email("ana@example.com").build();
        professional = Professional.builder().id(2L).publicId(professionalId).name("Beto")
                .email("beto@example.com").build();
        when(jobRequestRepository.save(any(JobRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jobRequestRepository.saveAndFlush(any(JobRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private JobRequest job(JobStatus status) {
        JobRequest job = JobRequest.builder().id(10L).client(client).professional(professional)
                .location("Montevideo").paymentAmount(BigDecimal.TEN).confirmationPinHash("hash").status(status).build();
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.of(job));
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

        assertEquals(JobStatus.REJECTED, service.rejectJobRequest(10L, professionalId).getStatus());
    }

    @Test
    void rejectJobRequest_notProposed_isRejected() {
        job(JobStatus.ACCEPTED);

        assertThrows(ResponseStatusException.class, () -> service.rejectJobRequest(10L, professionalId));
    }

    // --- cancel ---

    @Test
    void cancelJobRequest_proposed_byTheClient_isCancelledWithoutTouchingTheAgenda() {
        JobRequest job = job(JobStatus.PROPOSED);

        assertEquals(JobStatus.CANCELLED, service.cancelJobRequest(10L, clientId).getStatus());
        verify(scheduleService, never()).releaseJobSchedule(job);
    }

    @Test
    void cancelJobRequest_accepted_byTheProfessional_releasesTheAgenda() {
        JobRequest job = job(JobStatus.ACCEPTED);

        assertEquals(JobStatus.CANCELLED, service.cancelJobRequest(10L, professionalId).getStatus());
        verify(scheduleService).releaseJobSchedule(job);
    }

    @Test
    void cancelJobRequest_byAStranger_isForbidden() {
        job(JobStatus.PROPOSED);

        assertThrows(AccessDeniedException.class, () -> service.cancelJobRequest(10L, strangerId));
    }

    @Test
    void cancelJobRequest_completed_isRejected() {
        job(JobStatus.COMPLETED);

        assertThrows(ResponseStatusException.class, () -> service.cancelJobRequest(10L, clientId));
    }

    @Test
    void cancelJobRequest_unknownJob_isNotFound() {
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.empty());

        assertThrows(JobRequestNotFoundException.class, () -> service.cancelJobRequest(10L, clientId));
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

        assertEquals(1, service.getMyJobRequests(clientId).size());
        assertEquals(2, service.listAllJobRequests().size());
    }
}
