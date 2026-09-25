package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.update.ScheduleUpdateRequest;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.exception.ScheduleNotFoundException;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.ScheduleMapper;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.ScheduleRepository;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class ScheduleServiceImpl implements ScheduleService {

    private static final String BLOCK_STARTS_AFTER_END = "El inicio del bloque debe ser anterior al fin";
    private static final String BLOCK_OVERLAPS = "Ya existe un bloque de agenda en ese horario";

    private final ScheduleRepository scheduleRepository;
    private final ProfessionalRepository professionalRepository;
    private final ScheduleMapper scheduleMapper;

    public ScheduleServiceImpl(ScheduleRepository scheduleRepository,
                               ProfessionalRepository professionalRepository,
                               ScheduleMapper scheduleMapper) {
        this.scheduleRepository = scheduleRepository;
        this.professionalRepository = professionalRepository;
        this.scheduleMapper = scheduleMapper;
    }

    @Override
    @Transactional
    public ScheduleResponse createSchedule(ScheduleCreateRequest scheduleRequest, UUID professionalId) {
        if (scheduleRequest.getType() == ScheduleType.SCHEDULED_JOB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Un bloque de tipo SCHEDULED_JOB no se puede crear manualmente");
        }

        if (!scheduleRequest.getStartTimestamp().isBefore(scheduleRequest.getEndTimestamp())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    BLOCK_STARTS_AFTER_END);
        }

        Professional professional = professionalRepository.findByPublicId(professionalId)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));

        if (scheduleRepository.existsOverlapping(professionalId, scheduleRequest.getStartTimestamp(),
                scheduleRequest.getEndTimestamp(), 0L)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
        }

        Schedule schedule = scheduleMapper.toEntity(scheduleRequest);
        schedule.setProfessional(professional);

        schedule = scheduleRepository.save(schedule);
        return scheduleMapper.toResponse(schedule);
    }

    @Override
    @Transactional
    public ScheduleResponse updateSchedule(ScheduleUpdateRequest scheduleRequest, Long id, UUID professionalId) {
        Schedule schedule = scheduleRepository.findById(id)
                .orElseThrow(() -> new ScheduleNotFoundException("Bloque de agenda no encontrado."));

        if (!schedule.getProfessional().getPublicId().equals(professionalId)) {
            throw new AccessDeniedException("No tenés permiso para modificar este bloque de agenda");
        }

        if (schedule.getType() == ScheduleType.SCHEDULED_JOB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Un bloque de tipo SCHEDULED_JOB no se puede modificar manualmente");
        }

        LocalDateTime start = scheduleRequest.getStartTimestamp() != null
                ? scheduleRequest.getStartTimestamp() : schedule.getStartTimestamp();
        LocalDateTime end = scheduleRequest.getEndTimestamp() != null
                ? scheduleRequest.getEndTimestamp() : schedule.getEndTimestamp();

        if (!start.isBefore(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    BLOCK_STARTS_AFTER_END);
        }

        if (scheduleRepository.existsOverlapping(professionalId, start, end, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
        }

        schedule.setStartTimestamp(start);
        schedule.setEndTimestamp(end);

        schedule = scheduleRepository.save(schedule);
        return scheduleMapper.toResponse(schedule);
    }

    @Override
    @Transactional
    public ScheduleResponse createJobSchedule(JobRequest jobRequest, LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null || !start.isBefore(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    BLOCK_STARTS_AFTER_END);
        }

        Professional professional = jobRequest.getProfessional();

        if (scheduleRepository.existsOverlapping(professional.getPublicId(), start, end, 0L)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
        }

        Schedule schedule = Schedule.builder()
                .professional(professional)
                .jobRequest(jobRequest)
                .type(ScheduleType.SCHEDULED_JOB)
                .startTimestamp(start)
                .endTimestamp(end)
                .build();

        schedule = scheduleRepository.save(schedule);
        // Keeps the in-memory job in sync, so the accept response already carries the timeframe.
        jobRequest.getSchedules().add(schedule);
        return scheduleMapper.toResponse(schedule);
    }

    @Override
    @Transactional
    public void releaseJobSchedule(JobRequest jobRequest) {
        List<Schedule> jobSchedules = jobRequest.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .toList();
        jobRequest.getSchedules().removeAll(jobSchedules);
        scheduleRepository.deleteAll(jobSchedules);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ScheduleResponse> getAgenda(UUID professionalId, LocalDateTime from, LocalDateTime to,
                                            boolean ownerOrAdmin) {
        boolean visible = ownerOrAdmin
                ? professionalRepository.existsByPublicId(professionalId)
                : professionalRepository.existsByPublicIdAndPublishedTrue(professionalId);
        if (!visible) {
            throw new UserNotFoundException("Profesional no encontrado.");
        }

        return scheduleRepository.findAgenda(professionalId, from, to).stream()
                .map(scheduleMapper::toResponse)
                .peek(schedule -> {
                    // Which job a block belongs to is not for the public to know
                    if (!ownerOrAdmin) {
                        schedule.setJobRequestId(null);
                    }
                })
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ScheduleResponse> listAllSchedules() {
        return scheduleRepository.findAll().stream()
                .map(scheduleMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public void deleteSchedule(Long id, UUID professionalId) {
        Schedule schedule = scheduleRepository.findById(id)
                .orElseThrow(() -> new ScheduleNotFoundException("Bloque de agenda no encontrado."));

        if (!schedule.getProfessional().getPublicId().equals(professionalId)) {
            throw new AccessDeniedException("No tenés permiso para eliminar este bloque de agenda");
        }

        if (schedule.getType() == ScheduleType.SCHEDULED_JOB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Un bloque de tipo SCHEDULED_JOB no se puede eliminar manualmente");
        }

        scheduleRepository.delete(schedule);
    }
}
