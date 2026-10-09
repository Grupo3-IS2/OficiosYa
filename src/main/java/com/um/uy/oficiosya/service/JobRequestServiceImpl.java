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
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.Task;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.exception.JobRequestNotFoundException;
import com.um.uy.oficiosya.exception.TradeNotFoundException;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.mapper.JobRequestMapper;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class JobRequestServiceImpl implements JobRequestService {

    private static final String JOB_NOT_FOUND = "Trabajo no encontrado.";

    private static final SecureRandom PIN_RANDOM = new SecureRandom();

    private static final Set<JobStatus> CANCELLABLE =
            Set.of(JobStatus.PROPOSED, JobStatus.ACCEPTED, JobStatus.RESCHEDULE_REQUESTED);

    private final JobRequestRepository jobRequestRepository;
    private final ClientRepository clientRepository;
    private final ProfessionalRepository professionalRepository;
    private final TradeRepository tradeRepository;
    private final JobRequestMapper jobRequestMapper;
    private final ScheduleService scheduleService;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;
    /** Notice needed to cancel or reschedule an accepted job. */
    private final Duration minNotice;

    public JobRequestServiceImpl(JobRequestRepository jobRequestRepository,
                                  ClientRepository clientRepository,
                                  ProfessionalRepository professionalRepository,
                                  TradeRepository tradeRepository,
                                  JobRequestMapper jobRequestMapper,
                                  ScheduleService scheduleService,
                                  PasswordEncoder passwordEncoder,
                                  Clock clock,
                                  @Value("${app.job-request.min-notice-hours}") long minNoticeHours) {
        this.jobRequestRepository = jobRequestRepository;
        this.clientRepository = clientRepository;
        this.professionalRepository = professionalRepository;
        this.tradeRepository = tradeRepository;
        this.jobRequestMapper = jobRequestMapper;
        this.scheduleService = scheduleService;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
        this.minNotice = Duration.ofHours(minNoticeHours);
    }

    @Override
    @Transactional
    public JobRequestResponse createJobRequest(JobRequestCreateRequest request, UUID clientId) {
        Client client = clientRepository.findByPublicId(clientId)
                .orElseThrow(() -> new ClientNotFoundException("Cliente no encontrado."));

        Professional professional = professionalRepository.findByPublicId(request.getProfessionalId())
                .orElseThrow(() -> new ClientNotFoundException("Profesional no encontrado."));

        // A professional can request jobs like any client, just not to themselves
        if (professional.getPublicId().equals(client.getPublicId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No podés solicitarte un trabajo a vos mismo");
        }

        String pin = generatePin();

        JobRequest jobRequest = JobRequest.builder()
                .client(client)
                .professional(professional)
                .location(request.getLocation())
                .paymentAmount(request.getPaymentAmount())
                .confirmationPinHash(passwordEncoder.encode(pin))
                .build();

        List<Task> tasks = new ArrayList<>();
        for (TaskCreateRequest taskRequest : request.getTasks()) {
            Trade trade = tradeRepository.findById(taskRequest.getTradeId())
                    .orElseThrow(() -> new TradeNotFoundException("Oficio no encontrado."));

            tasks.add(Task.builder()
                    .trade(trade)
                    .jobRequest(jobRequest)
                    .description(taskRequest.getDescription())
                    .build());
        }
        jobRequest.setTasks(tasks);

        jobRequest = jobRequestRepository.save(jobRequest);

        JobRequestResponse response = jobRequestMapper.toResponse(jobRequest);
        response.setConfirmationPin(pin);
        return response;
    }

    @Override
    @Transactional
    public JobRequestResponse acceptJobRequest(Long id, JobRequestAcceptRequest request, UUID professionalId) {
        JobRequest jobRequest = findOwnedByProfessional(id, professionalId, "aceptar");

        if (jobRequest.getStatus() != JobStatus.PROPOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede aceptar un trabajo en estado PROPOSED");
        }

        requireFuture(request.getStartTimestamp());
        scheduleService.createJobSchedule(jobRequest, request.getStartTimestamp(), request.getEndTimestamp());

        jobRequest.setStatus(JobStatus.ACCEPTED);
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse rejectJobRequest(Long id, JobRequestRejectRequest request, UUID professionalId) {
        JobRequest jobRequest = findOwnedByProfessional(id, professionalId, "rechazar");

        if (jobRequest.getStatus() != JobStatus.PROPOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede rechazar un trabajo en estado PROPOSED");
        }

        jobRequest.setStatus(JobStatus.REJECTED);
        jobRequest.setRejectionReason(reason(request == null ? null : request.getReason()));
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse cancelJobRequest(Long id, JobRequestCancelRequest request, UUID requesterId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tenés permiso para cancelar este trabajo");
        }

        if (!CANCELLABLE.contains(jobRequest.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede cancelar un trabajo en estado PROPOSED, ACCEPTED o RESCHEDULE_REQUESTED");
        }

        if (jobRequest.getStatus() != JobStatus.PROPOSED) {
            requireNotice(jobRequest, "cancelar");
            scheduleService.releaseJobSchedule(jobRequest);
        }

        if (jobRequest.getPaymentState() == PaymentState.RETAINED) {
            jobRequest.setPaymentState(PaymentState.REFUNDED);
        }

        jobRequest.setStatus(JobStatus.CANCELLED);
        jobRequest.setCancelledBy(jobRequest.getClient().getPublicId().equals(requesterId)
                ? Role.CLIENT : Role.PROFESSIONAL);
        jobRequest.setCancellationReason(reason(request == null ? null : request.getReason()));
        jobRequest.clearReschedule();
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse requestReschedule(Long id, JobRequestRescheduleRequest request, UUID clientId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!jobRequest.getClient().getPublicId().equals(clientId)) {
            throw new AccessDeniedException("No tenés permiso para reagendar este trabajo");
        }

        if (jobRequest.getStatus() != JobStatus.ACCEPTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede reagendar un trabajo en estado ACCEPTED");
        }

        requireNotice(jobRequest, "reagendar");
        requireFuture(request.getStartTimestamp());
        // Fails early if the slot is already taken, rather than leaving the professional a request they can't approve
        scheduleService.checkJobSlotAvailable(jobRequest, request.getStartTimestamp(), request.getEndTimestamp());

        jobRequest.setRescheduleStart(request.getStartTimestamp());
        jobRequest.setRescheduleEnd(request.getEndTimestamp());
        jobRequest.setStatus(JobStatus.RESCHEDULE_REQUESTED);
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse acceptReschedule(Long id, UUID professionalId) {
        JobRequest jobRequest = findOwnedByProfessional(id, professionalId, "aceptar el cambio de horario de");

        if (jobRequest.getStatus() != JobStatus.RESCHEDULE_REQUESTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El trabajo no tiene un cambio de horario pendiente");
        }

        requireFuture(jobRequest.getRescheduleStart());
        scheduleService.moveJobSchedule(jobRequest, jobRequest.getRescheduleStart(), jobRequest.getRescheduleEnd());

        jobRequest.setStatus(JobStatus.ACCEPTED);
        jobRequest.clearReschedule();
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse rejectReschedule(Long id, UUID professionalId) {
        JobRequest jobRequest = findOwnedByProfessional(id, professionalId, "rechazar el cambio de horario de");

        if (jobRequest.getStatus() != JobStatus.RESCHEDULE_REQUESTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El trabajo no tiene un cambio de horario pendiente");
        }

        jobRequest.setStatus(JobStatus.ACCEPTED);
        jobRequest.clearReschedule();
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse completeJobRequest(Long id, JobRequestCompleteRequest request, UUID professionalId) {
        JobRequest jobRequest = findOwnedByProfessional(id, professionalId, "completar");

        // A pending reschedule doesn't stop the job from being done at its original time
        if (jobRequest.getStatus() != JobStatus.ACCEPTED && jobRequest.getStatus() != JobStatus.RESCHEDULE_REQUESTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede completar un trabajo en estado ACCEPTED");
        }

        if (!passwordEncoder.matches(request.getPin(), jobRequest.getConfirmationPinHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El PIN ingresado es incorrecto");
        }

        jobRequest.setStatus(JobStatus.COMPLETED);
        jobRequest.clearReschedule();
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse reviewJobRequest(Long id, JobRequestReviewRequest request, UUID clientId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!jobRequest.getClient().getPublicId().equals(clientId)) {
            throw new AccessDeniedException("No tenés permiso para calificar este trabajo");
        }

        if (jobRequest.getStatus() != JobStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede calificar un trabajo en estado COMPLETED");
        }

        if (jobRequest.getRating() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya calificaste este trabajo");
        }

        jobRequest.setRating(request.getRating());
        jobRequest.setReview(request.getReview() == null || request.getReview().isBlank()
                ? null : request.getReview().trim());
        jobRequest = jobRequestRepository.saveAndFlush(jobRequest);

        Professional professional = jobRequest.getProfessional();
        professional.setRating(jobRequestRepository.averageRatingOf(professional.getPublicId()));
        professionalRepository.save(professional);

        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional(readOnly = true)
    public JobRequestResponse getJobRequest(Long id, UUID requesterId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tenés permiso para ver este trabajo");
        }

        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> getMyJobRequests(UUID userId, JobStatus status) {
        List<JobRequest> jobs = status == null
                ? jobRequestRepository.findByParticipant(userId)
                : jobRequestRepository.findByParticipantAndStatus(userId, status);
        return jobs.stream()
                .map(jobRequestMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> listAllJobRequests() {
        return jobRequestRepository.findAll().stream()
                .map(jobRequestMapper::toResponse)
                .toList();
    }

    private JobRequest findOwnedByProfessional(Long id, UUID professionalId, String action) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!jobRequest.getProfessional().getPublicId().equals(professionalId)) {
            throw new AccessDeniedException("No tenés permiso para " + action + " este trabajo");
        }

        return jobRequest;
    }

    private boolean isParticipant(JobRequest jobRequest, UUID userId) {
        return jobRequest.getClient().getPublicId().equals(userId)
                || jobRequest.getProfessional().getPublicId().equals(userId);
    }

    private void requireFuture(OffsetDateTime start) {
        if (start != null && !start.isAfter(OffsetDateTime.now(clock))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El horario tiene que ser en el futuro");
        }
    }

    /** An accepted job can only be changed with at least {@link #minNotice} before it starts. */
    private void requireNotice(JobRequest jobRequest, String action) {
        jobRequest.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .findFirst()
                .filter(schedule -> schedule.getStartTimestamp().isBefore(OffsetDateTime.now(clock).plus(minNotice)))
                .ifPresent(schedule -> {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "No se puede " + action + " un trabajo con menos de " + minNotice.toHours()
                                    + " h de anticipación");
                });
    }

    private static String reason(String reason) {
        return reason == null || reason.isBlank() ? null : reason.trim();
    }

    private String generatePin() {
        return String.format("%06d", PIN_RANDOM.nextInt(1_000_000));
    }
}
