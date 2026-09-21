package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestConfirmRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.TaskCreateRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Task;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.exception.JobRequestNotFoundException;
import com.um.uy.oficiosya.exception.TradeNotFoundException;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.JobRequestMapper;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class JobRequestServiceImpl implements JobRequestService {

    private static final SecureRandom PIN_RANDOM = new SecureRandom();

    private final JobRequestRepository jobRequestRepository;
    private final ClientRepository clientRepository;
    private final ProfessionalRepository professionalRepository;
    private final TradeRepository tradeRepository;
    private final JobRequestMapper jobRequestMapper;
    private final ScheduleService scheduleService;
    private final PasswordEncoder passwordEncoder;

    public JobRequestServiceImpl(JobRequestRepository jobRequestRepository,
                                  ClientRepository clientRepository,
                                  ProfessionalRepository professionalRepository,
                                  TradeRepository tradeRepository,
                                  JobRequestMapper jobRequestMapper,
                                  ScheduleService scheduleService,
                                  PasswordEncoder passwordEncoder) {
        this.jobRequestRepository = jobRequestRepository;
        this.clientRepository = clientRepository;
        this.professionalRepository = professionalRepository;
        this.tradeRepository = tradeRepository;
        this.jobRequestMapper = jobRequestMapper;
        this.scheduleService = scheduleService;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public JobRequestResponse createJobRequest(JobRequestCreateRequest request, UUID clientId) {
        Client client = clientRepository.findByPublicId(clientId)
                .orElseThrow(() -> new UserNotFoundException("Cliente no encontrado."));

        Professional professional = professionalRepository.findByPublicId(request.getProfessionalId())
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));

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

        scheduleService.createJobSchedule(jobRequest, request.getStartTimestamp(), request.getEndTimestamp());

        jobRequest.setStatus(JobStatus.ACCEPTED);
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse rejectJobRequest(Long id, UUID professionalId) {
        JobRequest jobRequest = findOwnedByProfessional(id, professionalId, "rechazar");

        if (jobRequest.getStatus() != JobStatus.PROPOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede rechazar un trabajo en estado PROPOSED");
        }

        jobRequest.setStatus(JobStatus.REJECTED);
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse cancelJobRequest(Long id, UUID requesterId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException("Trabajo no encontrado."));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tenés permiso para cancelar este trabajo");
        }

        if (jobRequest.getStatus() != JobStatus.PROPOSED && jobRequest.getStatus() != JobStatus.ACCEPTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede cancelar un trabajo en estado PROPOSED o ACCEPTED");
        }

        if (jobRequest.getStatus() == JobStatus.ACCEPTED) {
            scheduleService.releaseJobSchedule(jobRequest);
        }

        jobRequest.setStatus(JobStatus.CANCELLED);
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional
    public JobRequestResponse confirmJobRequest(Long id, JobRequestConfirmRequest request, UUID professionalId) {
        JobRequest jobRequest = findOwnedByProfessional(id, professionalId, "confirmar");

        if (jobRequest.getStatus() != JobStatus.ACCEPTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede confirmar un trabajo en estado ACCEPTED");
        }

        if (!passwordEncoder.matches(request.getPin(), jobRequest.getConfirmationPinHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El PIN ingresado es incorrecto");
        }

        jobRequest.setStatus(JobStatus.COMPLETED);
        jobRequest = jobRequestRepository.save(jobRequest);
        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional(readOnly = true)
    public JobRequestResponse getJobRequest(Long id, UUID requesterId) {
        JobRequest jobRequest = jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException("Trabajo no encontrado."));

        if (!isParticipant(jobRequest, requesterId)) {
            throw new AccessDeniedException("No tenés permiso para ver este trabajo");
        }

        return jobRequestMapper.toResponse(jobRequest);
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> getJobRequestsAsClient(UUID clientId) {
        return jobRequestRepository.findByClient_PublicIdOrderByCreatedAtDesc(clientId).stream()
                .map(jobRequestMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> getJobRequestsAsProfessional(UUID professionalId) {
        return jobRequestRepository.findByProfessional_PublicIdOrderByCreatedAtDesc(professionalId).stream()
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
                .orElseThrow(() -> new JobRequestNotFoundException("Trabajo no encontrado."));

        if (!jobRequest.getProfessional().getPublicId().equals(professionalId)) {
            throw new AccessDeniedException("No tenés permiso para " + action + " este trabajo");
        }

        return jobRequest;
    }

    private boolean isParticipant(JobRequest jobRequest, UUID userId) {
        return jobRequest.getClient().getPublicId().equals(userId)
                || jobRequest.getProfessional().getPublicId().equals(userId);
    }

    private String generatePin() {
        return String.format("%06d", PIN_RANDOM.nextInt(1_000_000));
    }
}
