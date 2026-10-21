package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.update.ScheduleUpdateRequest;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.exception.ScheduleNotFoundException;
import com.um.uy.oficiosya.mapper.ScheduleMapper;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.ScheduleRepository;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class ScheduleServiceImpl implements ScheduleService {

    private static final String BLOCK_STARTS_AFTER_END = "Schedule block start must be before end";
    private static final String BLOCK_OVERLAPS = "A schedule block already exists in that timeframe";

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
                    "A SCHEDULED_JOB block cannot be created manually");
        }

        if (scheduleRequest.getStartTimestamp() == null || scheduleRequest.getEndTimestamp() == null
                || !scheduleRequest.getStartTimestamp().isBefore(scheduleRequest.getEndTimestamp())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    BLOCK_STARTS_AFTER_END);
        }

        Schedule schedule = scheduleMapper.toEntity(scheduleRequest);
        validateRecurrenceOrThrow(schedule);

        Professional professional = professionalRepository.findByPublicIdForUpdate(professionalId)
                .orElseThrow(() -> new ClientNotFoundException("Professional not found."));

        requireNoOverlap(professionalId, schedule, 0L);

        schedule.setProfessional(professional);
        schedule = scheduleRepository.save(schedule);
        return scheduleMapper.toResponse(schedule);
    }

    @Override
    @Transactional
    public ScheduleResponse updateSchedule(ScheduleUpdateRequest scheduleRequest, Long id, UUID professionalId) {
        Schedule schedule = scheduleRepository.findById(id)
                .orElseThrow(() -> new ScheduleNotFoundException("Schedule block not found."));

        if (!schedule.getProfessional().getPublicId().equals(professionalId)) {
            throw new AccessDeniedException("You do not have permission to modify this schedule block");
        }

        if (schedule.getType() == ScheduleType.SCHEDULED_JOB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A SCHEDULED_JOB block cannot be modified manually");
        }

        OffsetDateTime start = scheduleRequest.getStartTimestamp() != null
                ? scheduleRequest.getStartTimestamp() : schedule.getStartTimestamp();
        OffsetDateTime end = scheduleRequest.getEndTimestamp() != null
                ? scheduleRequest.getEndTimestamp() : schedule.getEndTimestamp();

        if (start == null || end == null || !start.isBefore(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    BLOCK_STARTS_AFTER_END);
        }

        String updatedRrule = scheduleRequest.getRrule() != null
                ? scheduleRequest.getRrule() : schedule.getRrule();
        String updatedTzid = scheduleRequest.getTzid() != null
                ? scheduleRequest.getTzid() : schedule.getTzid();
        List<OffsetDateTime> updatedExdates = scheduleRequest.getExdates() != null
                ? new ArrayList<>(scheduleRequest.getExdates())
                : (schedule.getExdates() != null ? new ArrayList<>(schedule.getExdates()) : new ArrayList<>());

        Schedule candidate = Schedule.builder()
                .id(schedule.getId())
                .professional(schedule.getProfessional())
                .type(schedule.getType())
                .startTimestamp(start)
                .endTimestamp(end)
                .rrule(updatedRrule)
                .tzid(updatedTzid)
                .exdates(updatedExdates)
                .build();
        validateRecurrenceOrThrow(candidate);

        lockAgenda(professionalId);
        requireNoOverlap(professionalId, candidate, id);

        schedule.setStartTimestamp(start);
        schedule.setEndTimestamp(end);
        schedule.setRrule(candidate.getRrule());
        schedule.setTzid(candidate.getTzid());
        schedule.setExdates(candidate.getExdates());
        schedule.setRecurrenceEnd(candidate.getRecurrenceEnd());

        schedule = scheduleRepository.save(schedule);
        return scheduleMapper.toResponse(schedule);
    }

    @Override
    @Transactional
    public ScheduleResponse createJobSchedule(JobRequest jobRequest, OffsetDateTime start, OffsetDateTime end) {
        if (start == null || end == null || !start.isBefore(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    BLOCK_STARTS_AFTER_END);
        }

        Professional professional = jobRequest.getProfessional();

        lockAgenda(professional.getPublicId());
        requireIntervalSlotFree(professional.getPublicId(), start, end, 0L);

        Schedule schedule = Schedule.builder()
                .professional(professional)
                .jobRequest(jobRequest)
                .type(ScheduleType.SCHEDULED_JOB)
                .startTimestamp(start)
                .endTimestamp(end)
                .recurrenceEnd(end)
                .build();

        schedule = scheduleRepository.save(schedule);
        // Keeps the in-memory job in sync, so the accept response already carries the timeframe.
        jobRequest.getSchedules().add(schedule);
        return scheduleMapper.toResponse(schedule);
    }

    @Override
    @Transactional(readOnly = true)
    public void checkJobSlotAvailable(JobRequest jobRequest, OffsetDateTime start, OffsetDateTime end) {
        requireJobSlotFree(jobRequest, start, end);
    }

    @Override
    @Transactional
    public ScheduleResponse moveJobSchedule(JobRequest jobRequest, OffsetDateTime start, OffsetDateTime end) {
        lockAgenda(jobRequest.getProfessional().getPublicId());
        requireJobSlotFree(jobRequest, start, end);

        Schedule schedule = jobBlock(jobRequest);
        schedule.setStartTimestamp(start);
        schedule.setEndTimestamp(end);
        schedule.setRecurrenceEnd(end);

        schedule = scheduleRepository.save(schedule);
        return scheduleMapper.toResponse(schedule);
    }

    /** The job's own block doesn't count as an overlap, since it's the one that would move. */
    private void requireJobSlotFree(JobRequest jobRequest, OffsetDateTime start, OffsetDateTime end) {
        if (start == null || end == null || !start.isBefore(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, BLOCK_STARTS_AFTER_END);
        }

        // A proposal has no block yet: then nothing of its own is left out of the overlap check
        Long ownBlockId = jobRequest.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .findFirst()
                .map(Schedule::getId)
                .orElse(0L);
        requireIntervalSlotFree(jobRequest.getProfessional().getPublicId(), start, end, ownBlockId);
    }

    private void requireIntervalSlotFree(UUID professionalId, OffsetDateTime start, OffsetDateTime end, Long excludeId) {
        if (scheduleRepository.existsOverlapping(professionalId, start, end, excludeId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
        }
        List<Schedule> candidates = scheduleRepository.findActiveCandidates(professionalId, start, end, excludeId);
        if (candidates != null) {
            for (Schedule existing : candidates) {
                if (existing.overlaps(start, end)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
                }
            }
        }
    }

    private void requireNoOverlap(UUID professionalId, Schedule candidate, Long excludeId) {
        if (scheduleRepository.existsOverlapping(
                professionalId, candidate.getStartTimestamp(), candidate.getEndTimestamp(), excludeId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
        }
        OffsetDateTime candidateEnd = candidate.getRecurrenceEnd();
        List<Schedule> existingSchedules = scheduleRepository.findActiveCandidates(
                professionalId, candidate.getStartTimestamp(), candidateEnd, excludeId);
        if (existingSchedules != null) {
            for (Schedule existing : existingSchedules) {
                if (candidate.overlaps(existing)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
                }
            }
        }
    }

    private static void validateRecurrenceOrThrow(Schedule schedule) {
        try {
            schedule.validateAndNormalizeRecurrence();
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
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
    public List<ScheduleResponse> getAgenda(UUID professionalId, OffsetDateTime from, OffsetDateTime to,
                                            boolean ownerOrAdmin) {
        requireProfessionalVisible(professionalId, ownerOrAdmin);

        return scheduleRepository.findAgenda(professionalId, from, to).stream()
                .flatMap(schedule -> {
                    if (!schedule.isRecurring() && (schedule.getExdates() == null || schedule.getExdates().isEmpty())) {
                        ScheduleResponse res = scheduleMapper.toResponse(schedule);
                        return res != null ? java.util.stream.Stream.of(res) : java.util.stream.Stream.empty();
                    }
                    return schedule.expandOccurrences(from, to).stream()
                            .map(occurrence -> scheduleMapper.toOccurrenceResponse(schedule, occurrence))
                            .filter(Objects::nonNull);
                })
                .map(schedule -> {
                    if (!ownerOrAdmin) {
                        schedule.setJobRequestId(null);
                    }
                    return schedule;
                })
                .sorted(Comparator.comparing(ScheduleResponse::getStartTimestamp,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public String exportAgendaICalendar(UUID professionalId, OffsetDateTime from, OffsetDateTime to,
                                        boolean ownerOrAdmin) {
        requireProfessionalVisible(professionalId, ownerOrAdmin);

        List<Schedule> schedules = scheduleRepository.findAgenda(professionalId, from, to);
        StringBuilder sb = new StringBuilder();
        sb.append("BEGIN:VCALENDAR\r\n");
        sb.append("VERSION:2.0\r\n");
        sb.append("PRODID:-//OficiosYa//Schedule//EN\r\n");
        sb.append("CALSCALE:GREGORIAN\r\n");
        for (Schedule schedule : schedules) {
            sb.append(schedule.toICalendarVEvent()).append("\r\n");
        }
        sb.append("END:VCALENDAR\r\n");
        return sb.toString();
    }

    private void requireProfessionalVisible(UUID professionalId, boolean ownerOrAdmin) {
        boolean visible = ownerOrAdmin
                ? professionalRepository.existsByPublicId(professionalId)
                : professionalRepository.existsByPublicIdAndPublishedTrue(professionalId);
        if (!visible) {
            throw new ClientNotFoundException("Professional not found.");
        }
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
                .orElseThrow(() -> new ScheduleNotFoundException("Schedule block not found."));

        if (!schedule.getProfessional().getPublicId().equals(professionalId)) {
            throw new AccessDeniedException("You do not have permission to delete this schedule block");
        }

        if (schedule.getType() == ScheduleType.SCHEDULED_JOB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A SCHEDULED_JOB block cannot be deleted manually");
        }

        scheduleRepository.delete(schedule);
    }

    /** See {@link ProfessionalRepository#findByPublicIdForUpdate}: serializes overlap checks per professional. */
    private void lockAgenda(UUID professionalId) {
        professionalRepository.findByPublicIdForUpdate(professionalId);
    }

    private Schedule jobBlock(JobRequest jobRequest) {
        return jobRequest.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .findFirst()
                .orElseThrow(() -> new ScheduleNotFoundException("The job does not have a scheduled timeframe."));
    }
}
