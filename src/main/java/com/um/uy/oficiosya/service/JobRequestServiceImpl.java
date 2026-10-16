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
import com.um.uy.oficiosya.entity.Conversation;
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
import com.um.uy.oficiosya.repository.ConversationRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
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
    private final ApplicationEventPublisher events;
    private final ConversationRepository conversationRepository;

    public JobRequestServiceImpl(JobRequestRepository jobRequestRepository,
                                  ClientRepository clientRepository,
                                  ProfessionalRepository professionalRepository,
                                  TradeRepository tradeRepository,
                                  JobRequestMapper jobRequestMapper,
                                  ScheduleService scheduleService,
                                  PasswordEncoder passwordEncoder,
                                  Clock clock,
                                  @Value("${app.job-request.min-notice-hours}") long minNoticeHours,
                                  ApplicationEventPublisher events,
                                  ConversationRepository conversationRepository) {
        this.jobRequestRepository = jobRequestRepository;
        this.clientRepository = clientRepository;
        this.professionalRepository = professionalRepository;
        this.tradeRepository = tradeRepository;
        this.jobRequestMapper = jobRequestMapper;
        this.scheduleService = scheduleService;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
        this.minNotice = Duration.ofHours(minNoticeHours);
        this.events = events;
        this.conversationRepository = conversationRepository;
    }

    @Override
    @Transactional
    public JobRequestResponse createJobRequest(JobRequestCreateRequest request, UUID callerId) {
        if ((request.getProfessionalId() == null) == (request.getClientId() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Indicá el profesional o el cliente del trabajo, uno de los dos");
        }
        boolean byProfessional = request.getClientId() != null;

        Client client;
        Professional professional;
        if (byProfessional) {
            professional = professionalRepository.findByPublicId(callerId)
                    .orElseThrow(() -> new AccessDeniedException("Solo un profesional puede proponerle un trabajo a un cliente"));
            client = clientRepository.findByPublicId(request.getClientId())
                    .orElseThrow(() -> new ClientNotFoundException("Cliente no encontrado."));
        } else {
            client = clientRepository.findByPublicId(callerId)
                    .orElseThrow(() -> new ClientNotFoundException("Cliente no encontrado."));
            professional = professionalRepository.findByPublicId(request.getProfessionalId())
                    .orElseThrow(() -> new ClientNotFoundException("Profesional no encontrado."));
        }

        // A professional can request jobs like any client, just not to themselves
        if (professional.getPublicId().equals(client.getPublicId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes solicitarte un trabajo a vos mismo");
        }

        // The proposal shows up in the pair's chat, so a block there would be skipped by proposing
        Conversation conversation = conversationRepository.findBetween(client.getId(), professional.getId()).orElse(null);
        if (conversation != null && conversation.isBlocked()) {
            throw new AccessDeniedException("La conversación con esta persona está bloqueada");
        }

        JobRequest jobRequest = JobRequest.builder()
                .client(client)
                .professional(professional)
                .location(request.getLocation())
                .paymentAmount(request.getPaymentAmount())
                .proposedBy(byProfessional ? Role.PROFESSIONAL : Role.CLIENT)
                .build();

        String pin = null;
        if (byProfessional) {
            // The only way a professional knows a client is that they talked first
            if (conversation == null) {
                throw new AccessDeniedException("Solo puedes proponerle un trabajo a un cliente con el que ya tengas una conversación");
            }
            if (request.getStartTimestamp() == null || request.getEndTimestamp() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El horario propuesto es obligatorio");
            }
            requireFuture(request.getStartTimestamp());
            scheduleService.checkJobSlotAvailable(jobRequest, request.getStartTimestamp(), request.getEndTimestamp());
            jobRequest.setProposedStart(request.getStartTimestamp());
            jobRequest.setProposedEnd(request.getEndTimestamp());
        } else {
            if (request.getStartTimestamp() != null || request.getEndTimestamp() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "El horario lo elige el profesional al aceptar el trabajo");
            }
            pin = generatePin();
            jobRequest.setConfirmationPinHash(passwordEncoder.encode(pin));
        }

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
        // Its card in the chat is saved in this same transaction (ChatJobListener)
        events.publishEvent(new JobRequestEvents.JobProposed(jobRequest.getId()));

        JobRequestResponse response = jobRequestMapper.toResponse(jobRequest);
        response.setConfirmationPin(pin);
        awaitingAnswersMayHaveChanged(jobRequest);
        return response;
    }

    @Override
    @Transactional
    public JobRequestResponse acceptJobRequest(Long id, JobRequestAcceptRequest request, UUID requesterId) {
        JobRequest jobRequest = findProposalToAnswer(id, requesterId, "aceptar");

        if (jobRequest.getStatus() != JobStatus.PROPOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede aceptar un trabajo en estado PROPOSED");
        }

        String pin = null;
        if (jobRequest.getProposedBy() == Role.PROFESSIONAL) {
            // The client takes the timeframe the professional offered, as it is
            if (request != null && (request.getStartTimestamp() != null || request.getEndTimestamp() != null)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "El horario ya lo propuso el profesional, aceptalo sin cambiarlo");
            }
            requireFuture(jobRequest.getProposedStart());
            scheduleService.createJobSchedule(jobRequest, jobRequest.getProposedStart(), jobRequest.getProposedEnd());
            pin = generatePin();
            jobRequest.setConfirmationPinHash(passwordEncoder.encode(pin));
            jobRequest.setProposedStart(null);
            jobRequest.setProposedEnd(null);
        } else {
            if (request == null || request.getStartTimestamp() == null || request.getEndTimestamp() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Elegí el horario del trabajo para aceptarlo");
            }
            requireFuture(request.getStartTimestamp());
            scheduleService.createJobSchedule(jobRequest, request.getStartTimestamp(), request.getEndTimestamp());
        }

        jobRequest.setStatus(JobStatus.ACCEPTED);
        jobRequest = jobRequestRepository.save(jobRequest);
        statusChanged(jobRequest, JobRequestEvents.Change.ACCEPTED, requesterId);
        JobRequestResponse response = jobRequestMapper.toResponse(jobRequest);
        response.setConfirmationPin(pin);
        return response;
    }

    @Override
    @Transactional
    public JobRequestResponse rejectJobRequest(Long id, JobRequestRejectRequest request, UUID requesterId) {
        JobRequest jobRequest = findProposalToAnswer(id, requesterId, "rechazar");

        if (jobRequest.getStatus() != JobStatus.PROPOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede rechazar un trabajo en estado PROPOSED");
        }

        jobRequest.setStatus(JobStatus.REJECTED);
        jobRequest.setRejectionReason(reason(request == null ? null : request.getReason()));
        jobRequest = jobRequestRepository.save(jobRequest);
        statusChanged(jobRequest, JobRequestEvents.Change.REJECTED, requesterId);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse cancelJobRequest(Long id, JobRequestCancelRequest request, UUID requesterId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tienes permiso para cancelar este trabajo");
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
        statusChanged(jobRequest, JobRequestEvents.Change.CANCELLED, requesterId);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse requestReschedule(Long id, JobRequestRescheduleRequest request, UUID requesterId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tienes permiso para reagendar este trabajo");
        }

        if (jobRequest.getStatus() != JobStatus.ACCEPTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede reagendar un trabajo en estado ACCEPTED");
        }

        requireNotice(jobRequest, "reagendar");
        requireFuture(request.getStartTimestamp());
        requireDifferentTimeframe(jobRequest, request.getStartTimestamp(), request.getEndTimestamp());
        // Fails early if the professional's slot is already taken, rather than leaving a request nobody can approve
        scheduleService.checkJobSlotAvailable(jobRequest, request.getStartTimestamp(), request.getEndTimestamp());

        jobRequest.setRescheduleStart(request.getStartTimestamp());
        jobRequest.setRescheduleEnd(request.getEndTimestamp());
        jobRequest.setRescheduleRequestedBy(sideOf(jobRequest, requesterId));
        jobRequest.setStatus(JobStatus.RESCHEDULE_REQUESTED);
        jobRequest = jobRequestRepository.save(jobRequest);
        events.publishEvent(new JobRequestEvents.RescheduleRequested(jobRequest.getId()));
        statusChanged(jobRequest, JobRequestEvents.Change.RESCHEDULE_REQUESTED, requesterId);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse acceptReschedule(Long id, UUID requesterId) {
        JobRequest jobRequest = findPendingRescheduleToAnswer(id, requesterId, "aceptar");

        requireFuture(jobRequest.getRescheduleStart());
        scheduleService.moveJobSchedule(jobRequest, jobRequest.getRescheduleStart(), jobRequest.getRescheduleEnd());

        jobRequest.setStatus(JobStatus.ACCEPTED);
        jobRequest.clearReschedule();
        jobRequest = jobRequestRepository.save(jobRequest);
        statusChanged(jobRequest, JobRequestEvents.Change.RESCHEDULE_ACCEPTED, requesterId);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse rejectReschedule(Long id, UUID requesterId) {
        JobRequest jobRequest = findPendingRescheduleToAnswer(id, requesterId, "rechazar");

        jobRequest.setStatus(JobStatus.ACCEPTED);
        jobRequest.clearReschedule();
        jobRequest = jobRequestRepository.save(jobRequest);
        statusChanged(jobRequest, JobRequestEvents.Change.RESCHEDULE_REJECTED, requesterId);
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
        statusChanged(jobRequest, JobRequestEvents.Change.COMPLETED, professionalId);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse reviewJobRequest(Long id, JobRequestReviewRequest request, UUID clientId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!jobRequest.getClient().getPublicId().equals(clientId)) {
            throw new AccessDeniedException("No tienes permiso para calificar este trabajo");
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
    @Transactional
    public boolean expireProposal(Long id) {
        JobRequest jobRequest = jobRequestRepository.findById(id).orElse(null);
        // Answered in between: whoever got there first wins (and @Version settles an exact tie)
        if (jobRequest == null || jobRequest.getStatus() != JobStatus.PROPOSED) {
            return false;
        }

        jobRequest.setStatus(JobStatus.EXPIRED);
        jobRequest = jobRequestRepository.save(jobRequest);
        statusChanged(jobRequest, JobRequestEvents.Change.EXPIRED, null);
        return true;
    }

    @Override
    @Transactional(readOnly = true)
    public JobRequestResponse getJobRequest(Long id, UUID requesterId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tienes permiso para ver este trabajo");
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

    /**
     * Any change to a job can make what waits for either side's answer grow or shrink; the emails
     * about it go out once the change is saved (RequestNotificationListener).
     */
    private void awaitingAnswersMayHaveChanged(JobRequest jobRequest) {
        events.publishEvent(new JobRequestEvents.AwaitingAnswersChanged(Set.of(
                jobRequest.getClient().getPublicId(), jobRequest.getProfessional().getPublicId())));
    }

    /** Tells the chat card, the emails and the awaiting-answer alerts that the job changed. */
    private void statusChanged(JobRequest jobRequest, JobRequestEvents.Change change, UUID actorId) {
        events.publishEvent(new JobRequestEvents.JobStatusChanged(jobRequest.getId(), change, actorId));
        awaitingAnswersMayHaveChanged(jobRequest);
    }

    /** A proposal is answered by the side that didn't make it; the one who did can only cancel it. */
    private JobRequest findProposalToAnswer(Long id, UUID requesterId, String action) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tienes permiso para " + action + " este trabajo");
        }
        if (sideOf(jobRequest, requesterId) == jobRequest.getProposedBy()) {
            throw new AccessDeniedException("La propuesta la hiciste vos: tiene que responderla la otra parte");
        }

        return jobRequest;
    }

    private JobRequest findOwnedByProfessional(Long id, UUID professionalId, String action) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!jobRequest.getProfessional().getPublicId().equals(professionalId)) {
            throw new AccessDeniedException("No tienes permiso para " + action + " este trabajo");
        }

        return jobRequest;
    }

    /**
     * A reschedule is answered by the side that didn't ask for it. The one who asked can't approve
     * their own proposal; they can still cancel the job.
     */
    private JobRequest findPendingRescheduleToAnswer(Long id, UUID requesterId, String action) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException(JOB_NOT_FOUND));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tienes permiso para " + action + " el cambio de horario de este trabajo");
        }

        if (jobRequest.getStatus() != JobStatus.RESCHEDULE_REQUESTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El trabajo no tiene un cambio de horario pendiente");
        }

        // Requests from before either side could ask were always the client's
        Role requestedBy = jobRequest.getRescheduleRequestedBy() == null ? Role.CLIENT : jobRequest.getRescheduleRequestedBy();
        if (sideOf(jobRequest, requesterId) == requestedBy) {
            throw new AccessDeniedException("El cambio de horario lo pediste vos: tiene que responderlo la otra parte");
        }

        return jobRequest;
    }

    /** The side of the job the user is on; only for a participant. */
    private static Role sideOf(JobRequest jobRequest, UUID userId) {
        return jobRequest.getClient().getPublicId().equals(userId) ? Role.CLIENT : Role.PROFESSIONAL;
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

    /** A reschedule to the timeframe already agreed would leave the professional nothing to decide. */
    private static void requireDifferentTimeframe(JobRequest jobRequest, OffsetDateTime start, OffsetDateTime end) {
        boolean same = jobRequest.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .findFirst()
                .map(schedule -> schedule.getStartTimestamp().isEqual(start) && schedule.getEndTimestamp().isEqual(end))
                .orElse(false);

        if (same) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El nuevo horario es igual al actual, elegí uno distinto");
        }
    }

    private static String reason(String reason) {
        return reason == null || reason.isBlank() ? null : reason.trim();
    }

    private String generatePin() {
        return String.format("%06d", PIN_RANDOM.nextInt(1_000_000));
    }
}
