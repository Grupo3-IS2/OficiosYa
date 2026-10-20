package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.update.ScheduleUpdateRequest;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.exception.ScheduleNotFoundException;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.mapper.ScheduleMapper;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.ScheduleRepository;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.dmfs.rfc5545.DateTime;
import org.dmfs.rfc5545.recur.InvalidRecurrenceRuleException;
import org.dmfs.rfc5545.recur.RecurrenceRule;
import org.dmfs.rfc5545.recur.RecurrenceRuleIterator;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.TimeZone;
import java.util.UUID;

@Service
public class ScheduleServiceImpl implements ScheduleService {

    private static final String BLOCK_STARTS_AFTER_END = "El inicio del bloque debe ser anterior al fin";
    private static final String BLOCK_OVERLAPS = "Ya existe un bloque de agenda en ese horario";
    private static final String INVALID_RRULE = "La regla de recurrencia (RRULE) no es válida";
    private static final int MAX_OCCURRENCES = 500;

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

        String rruleText = normalizeAndValidateRrule(scheduleRequest.getRruleText(),
                scheduleRequest.getStartTimestamp());

        Professional professional = professionalRepository.findByPublicIdForUpdate(professionalId)
                .orElseThrow(() -> new ClientNotFoundException("Profesional no encontrado."));

        requireNoOverlap(professionalId, scheduleRequest.getStartTimestamp(),
                scheduleRequest.getEndTimestamp(), rruleText, 0L);

        Schedule schedule = scheduleMapper.toEntity(scheduleRequest);
        schedule.setRruleText(rruleText);
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
            throw new AccessDeniedException("No tienes permiso para modificar este bloque de agenda");
        }

        if (schedule.getType() == ScheduleType.SCHEDULED_JOB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Un bloque de tipo SCHEDULED_JOB no se puede modificar manualmente");
        }

        OffsetDateTime start = scheduleRequest.getStartTimestamp() != null
                ? scheduleRequest.getStartTimestamp() : schedule.getStartTimestamp();
        OffsetDateTime end = scheduleRequest.getEndTimestamp() != null
                ? scheduleRequest.getEndTimestamp() : schedule.getEndTimestamp();

        if (!start.isBefore(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    BLOCK_STARTS_AFTER_END);
        }

        String rruleText = scheduleRequest.getRruleText() != null
                ? normalizeAndValidateRrule(scheduleRequest.getRruleText(), start)
                : normalizeAndValidateRrule(schedule.getRruleText(), start);

        lockAgenda(professionalId);
        requireNoOverlap(professionalId, start, end, rruleText, id);

        schedule.setStartTimestamp(start);
        schedule.setEndTimestamp(end);
        schedule.setRruleText(rruleText);

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
        requireNoOverlap(professional.getPublicId(), start, end, null, 0L);

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
        if (scheduleRepository.existsOverlapping(jobRequest.getProfessional().getPublicId(), start, end, ownBlockId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
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
        boolean visible = ownerOrAdmin
                ? professionalRepository.existsByPublicId(professionalId)
                : professionalRepository.existsByPublicIdAndPublishedTrue(professionalId);
        if (!visible) {
            throw new ClientNotFoundException("Profesional no encontrado.");
        }

        List<Schedule> rawSchedules = scheduleRepository.findAgenda(professionalId, to);
        return expandSchedulesInRange(rawSchedules, from, to).stream()
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
            throw new AccessDeniedException("No tienes permiso para eliminar este bloque de agenda");
        }

        if (schedule.getType() == ScheduleType.SCHEDULED_JOB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Un bloque de tipo SCHEDULED_JOB no se puede eliminar manualmente");
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
                .orElseThrow(() -> new ScheduleNotFoundException("El trabajo no tiene un horario agendado."));
    }

    private void requireNoOverlap(UUID professionalId, OffsetDateTime start, OffsetDateTime end,
                                  String rruleText, Long excludeId) {
        Schedule candidate = Schedule.builder()
                .startTimestamp(start)
                .endTimestamp(end)
                .rruleText(rruleText)
                .build();
        List<Schedule> candidateOccurrences = expandSchedule(candidate, start, null);
        if (candidateOccurrences.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_RRULE);
        }

        for (int i = 0; i < candidateOccurrences.size(); i++) {
            for (int j = i + 1; j < candidateOccurrences.size(); j++) {
                if (overlaps(candidateOccurrences.get(i), candidateOccurrences.get(j))) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
                }
            }
        }

        OffsetDateTime rangeStart = candidateOccurrences.getFirst().getStartTimestamp();
        OffsetDateTime rangeEnd = candidateOccurrences.getLast().getEndTimestamp();

        List<Schedule> existingBeforeEnd = scheduleRepository.findBeforeEndExcluding(professionalId, rangeEnd, excludeId);
        List<Schedule> existingOccurrences = expandSchedulesInRange(existingBeforeEnd, rangeStart, rangeEnd);

        for (Schedule cand : candidateOccurrences) {
            for (Schedule existing : existingOccurrences) {
                if (overlaps(cand, existing)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, BLOCK_OVERLAPS);
                }
            }
        }
    }

    private boolean overlaps(Schedule a, Schedule b) {
        return a.getStartTimestamp().isBefore(b.getEndTimestamp())
                && a.getEndTimestamp().isAfter(b.getStartTimestamp());
    }

    private List<Schedule> expandSchedulesInRange(List<Schedule> schedules, OffsetDateTime from, OffsetDateTime to) {
        return schedules.stream()
                .flatMap(schedule -> expandSchedule(schedule, from, to).stream())
                .sorted(Comparator.comparing(Schedule::getStartTimestamp))
                .toList();
    }

    private List<Schedule> expandSchedule(Schedule schedule, OffsetDateTime from, OffsetDateTime to) {
        OffsetDateTime start = schedule.getStartTimestamp();
        OffsetDateTime end = schedule.getEndTimestamp();
        if (start == null || end == null || !start.isBefore(end)) {
            return List.of();
        }
        if (to != null && !start.isBefore(to)) {
            return List.of();
        }

        String rruleText = schedule.getRruleText();
        if (rruleText == null || rruleText.isBlank()) {
            if (from != null && !end.isAfter(from)) {
                return List.of();
            }
            return List.of(schedule);
        }

        RecurrenceRule rule = parseRrule(rruleText);
        Duration duration = Duration.between(start, end);
        RecurrenceRuleIterator iterator = rule.iterator(toDmfsDateTime(start, rule));

        OffsetDateTime effectiveTo = to;
        if (effectiveTo == null && rule.isInfinite()) {
            OffsetDateTime anchor = (from != null && from.isAfter(start)) ? from : start;
            effectiveTo = anchor.plusYears(1);
        }

        List<Schedule> occurrences = new ArrayList<>();
        int generated = 0;
        while (iterator.hasNext() && generated < MAX_OCCURRENCES) {
            DateTime nextDt = iterator.nextDateTime();
            generated++;
            OffsetDateTime occStart = toOffsetDateTime(nextDt, start);
            if (effectiveTo != null && !occStart.isBefore(effectiveTo)) {
                break;
            }
            OffsetDateTime occEnd = occStart.plus(duration).withOffsetSameInstant(end.getOffset());
            if (from == null || occEnd.isAfter(from)) {
                occurrences.add(Schedule.builder()
                        .id(schedule.getId())
                        .professional(schedule.getProfessional())
                        .jobRequest(schedule.getJobRequest())
                        .type(schedule.getType())
                        .startTimestamp(occStart)
                        .endTimestamp(occEnd)
                        .rruleText(schedule.getRruleText())
                        .build());
            }
        }
        return occurrences;
    }

    private String normalizeAndValidateRrule(String rruleText, OffsetDateTime start) {
        if (rruleText == null || rruleText.isBlank()) {
            return null;
        }
        String normalized = rruleText.trim();
        if (normalized.regionMatches(true, 0, "RRULE:", 0, 6)) {
            normalized = normalized.substring(6).trim();
        }
        if (normalized.isEmpty()) {
            return null;
        }
        RecurrenceRule rule = parseRrule(normalized);
        try {
            rule.iterator(toDmfsDateTime(start, rule));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_RRULE);
        }
        return normalized;
    }

    private RecurrenceRule parseRrule(String rruleText) {
        try {
            return new RecurrenceRule(rruleText);
        } catch (InvalidRecurrenceRuleException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_RRULE);
        }
    }

    private DateTime toDmfsDateTime(OffsetDateTime odt, RecurrenceRule rule) {
        if (rule.getUntil() != null && rule.getUntil().isFloating()) {
            return new DateTime(
                    odt.getYear(),
                    odt.getMonthValue() - 1,
                    odt.getDayOfMonth(),
                    odt.getHour(),
                    odt.getMinute(),
                    odt.getSecond()
            );
        }
        TimeZone timeZone = TimeZone.getTimeZone(odt.getOffset());
        return new DateTime(
                timeZone,
                odt.getYear(),
                odt.getMonthValue() - 1,
                odt.getDayOfMonth(),
                odt.getHour(),
                odt.getMinute(),
                odt.getSecond()
        );
    }

    private OffsetDateTime toOffsetDateTime(DateTime dt, OffsetDateTime referenceStart) {
        ZoneOffset offset = referenceStart.getOffset();
        DateTime shifted = dt.isFloating() ? dt : dt.shiftTimeZone(TimeZone.getTimeZone(offset));
        return OffsetDateTime.of(
                shifted.getYear(),
                shifted.getMonth() + 1,
                shifted.getDayOfMonth(),
                shifted.getHours(),
                shifted.getMinutes(),
                shifted.getSeconds(),
                referenceStart.getNano(),
                offset
        );
    }
}
