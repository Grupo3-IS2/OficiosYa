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
import com.um.uy.oficiosya.mapper.ScheduleMapperImpl;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.ScheduleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A professional's agenda: manual blocks, the SCHEDULED_JOB blocks that jobs create, RFC 5545 recurrence, and who sees what. */
class ScheduleServiceImplTest {

    @Mock
    private ScheduleRepository scheduleRepository;
    @Mock
    private ProfessionalRepository professionalRepository;

    private ScheduleServiceImpl service;

    private final UUID professionalId = UUID.randomUUID();
    private final OffsetDateTime start = OffsetDateTime.now().plusDays(1);
    private final OffsetDateTime end = start.plusHours(2);
    private Professional professional;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ScheduleServiceImpl(scheduleRepository, professionalRepository, new ScheduleMapperImpl());
        professional = Professional.builder().id(1L).publicId(professionalId).name("John").build();
        when(scheduleRepository.save(any(Schedule.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private ScheduleCreateRequest createRequest(ScheduleType type, OffsetDateTime from, OffsetDateTime to) {
        ScheduleCreateRequest request = new ScheduleCreateRequest();
        request.setType(type);
        request.setStartTimestamp(from);
        request.setEndTimestamp(to);
        return request;
    }

    private Schedule block(ScheduleType type) {
        Schedule schedule = Schedule.builder().id(5L).professional(professional).type(type)
                .startTimestamp(start).endTimestamp(end).build();
        when(scheduleRepository.findById(5L)).thenReturn(Optional.of(schedule));
        return schedule;
    }

    // --- create ---

    @Test
    void createSchedule_savesTheBlockOnTheCallersAgenda() {
        when(professionalRepository.findByPublicIdForUpdate(professionalId)).thenReturn(Optional.of(professional));

        ScheduleResponse response = service.createSchedule(
                createRequest(ScheduleType.USER_RESERVED, start, end), professionalId);

        assertEquals(professionalId, response.getProfessionalId());
        assertEquals(ScheduleType.USER_RESERVED, response.getType());
        assertEquals(start, response.getStartTimestamp());
        assertEquals(end, response.getRecurrenceEnd());
    }

    @Test
    void createSchedule_withRecurringRule_computesRecurrenceEndAndSavesSingleRow() {
        when(professionalRepository.findByPublicIdForUpdate(professionalId)).thenReturn(Optional.of(professional));
        OffsetDateTime mondayStart = OffsetDateTime.of(2030, 5, 6, 9, 0, 0, 0, ZoneOffset.ofHours(-3));
        OffsetDateTime mondayEnd = OffsetDateTime.of(2030, 5, 6, 11, 0, 0, 0, ZoneOffset.ofHours(-3));

        ScheduleCreateRequest request = createRequest(ScheduleType.URGENT_AVAILABLE, mondayStart, mondayEnd);
        request.setRrule("RRULE:freq=weekly;count=3");
        request.setTzid("America/Montevideo");

        ScheduleResponse response = service.createSchedule(request, professionalId);

        assertEquals("FREQ=WEEKLY;COUNT=3", response.getRrule());
        assertEquals("America/Montevideo", response.getTzid());
        assertEquals(mondayEnd.plusWeeks(2), response.getRecurrenceEnd());
    }

    @Test
    void createSchedule_unboundedRecurrence_hasNullRecurrenceEnd() {
        when(professionalRepository.findByPublicIdForUpdate(professionalId)).thenReturn(Optional.of(professional));
        ScheduleCreateRequest request = createRequest(ScheduleType.URGENT_AVAILABLE, start, end);
        request.setRrule("FREQ=DAILY");

        ScheduleResponse response = service.createSchedule(request, professionalId);
        assertEquals("FREQ=DAILY", response.getRrule());
        assertNull(response.getRecurrenceEnd());
    }

    @Test
    void createSchedule_invalidTzid_isRejectedWith400() {
        ScheduleCreateRequest request = createRequest(ScheduleType.URGENT_AVAILABLE, start, end);
        request.setTzid("Invalid/Tz");

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.createSchedule(request, professionalId));
        assertEquals(400, e.getStatusCode().value());
    }

    @Test
    void createSchedule_invalidRRule_isRejectedWith400() {
        ScheduleCreateRequest request = createRequest(ScheduleType.URGENT_AVAILABLE, start, end);
        request.setRrule("FREQ=INVALID_FREQ;COUNT=3");

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.createSchedule(request, professionalId));
        assertEquals(400, e.getStatusCode().value());
    }

    @Test
    void createSchedule_scheduledJob_cannotBeCreatedByHand() {
        ScheduleCreateRequest request = createRequest(ScheduleType.SCHEDULED_JOB, start, end);

        assertThrows(ResponseStatusException.class, () -> service.createSchedule(request, professionalId));
    }

    @Test
    void createSchedule_startNotBeforeEnd_isRejected() {
        ScheduleCreateRequest request = createRequest(ScheduleType.URGENT_AVAILABLE, end, start);

        assertThrows(ResponseStatusException.class, () -> service.createSchedule(request, professionalId));
    }

    @Test
    void createSchedule_unknownProfessional_isRejected() {
        when(professionalRepository.findByPublicIdForUpdate(professionalId)).thenReturn(Optional.empty());
        ScheduleCreateRequest request = createRequest(ScheduleType.URGENT_AVAILABLE, start, end);

        assertThrows(ClientNotFoundException.class, () -> service.createSchedule(request, professionalId));
    }

    @Test
    void createSchedule_overlapping_isAConflict() {
        when(professionalRepository.findByPublicIdForUpdate(professionalId)).thenReturn(Optional.of(professional));
        when(scheduleRepository.existsOverlapping(professionalId, start, end, 0L)).thenReturn(true);
        ScheduleCreateRequest request = createRequest(ScheduleType.URGENT_AVAILABLE, start, end);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.createSchedule(request, professionalId));
        assertEquals(409, e.getStatusCode().value());
    }

    @Test
    void createSchedule_overlappingRecurringOccurrence_isAConflict() {
        when(professionalRepository.findByPublicIdForUpdate(professionalId)).thenReturn(Optional.of(professional));
        OffsetDateTime baseStart = OffsetDateTime.of(2030, 5, 6, 9, 0, 0, 0, ZoneOffset.ofHours(-3));
        OffsetDateTime baseEnd = OffsetDateTime.of(2030, 5, 6, 11, 0, 0, 0, ZoneOffset.ofHours(-3));
        Schedule existingRecurring = Schedule.builder()
                .id(10L)
                .professional(professional)
                .type(ScheduleType.URGENT_AVAILABLE)
                .startTimestamp(baseStart)
                .endTimestamp(baseEnd)
                .rrule("FREQ=WEEKLY;COUNT=4")
                .build();
        existingRecurring.validateAndNormalizeRecurrence();

        OffsetDateTime thirdWeekStart = baseStart.plusWeeks(2).plusMinutes(30);
        OffsetDateTime thirdWeekEnd = baseEnd.plusWeeks(2);
        when(scheduleRepository.findActiveCandidates(eq(professionalId), eq(thirdWeekStart), any(), eq(0L)))
                .thenReturn(List.of(existingRecurring));

        ScheduleCreateRequest request = createRequest(ScheduleType.USER_RESERVED, thirdWeekStart, thirdWeekEnd);
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.createSchedule(request, professionalId));
        assertEquals(409, e.getStatusCode().value());
    }

    // --- update ---

    @Test
    void updateSchedule_changesOnlyTheFieldsSent() {
        block(ScheduleType.USER_RESERVED);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();
        request.setEndTimestamp(end.plusHours(1));

        ScheduleResponse response = service.updateSchedule(request, 5L, professionalId);

        assertEquals(start, response.getStartTimestamp());
        assertEquals(end.plusHours(1), response.getEndTimestamp());
    }

    @Test
    void updateSchedule_bothFields_areApplied() {
        block(ScheduleType.USER_RESERVED);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();
        request.setStartTimestamp(start.minusHours(1));
        request.setEndTimestamp(end.minusHours(1));

        ScheduleResponse response = service.updateSchedule(request, 5L, professionalId);

        assertEquals(start.minusHours(1), response.getStartTimestamp());
        assertEquals(end.minusHours(1), response.getEndTimestamp());
    }

    @Test
    void updateSchedule_updatesRRuleAndExdates() {
        Schedule existing = block(ScheduleType.URGENT_AVAILABLE);
        OffsetDateTime excludedOccurrence = existing.getStartTimestamp().plusDays(1);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();
        request.setRrule("FREQ=DAILY;COUNT=3");
        request.setTzid("UTC");
        request.setExdates(List.of(excludedOccurrence));

        ScheduleResponse response = service.updateSchedule(request, 5L, professionalId);

        assertEquals("FREQ=DAILY;COUNT=3", response.getRrule());
        assertEquals("UTC", response.getTzid());
        assertEquals(1, response.getExdates().size());
        assertEquals(end.plusDays(2).withOffsetSameInstant(ZoneOffset.UTC), response.getRecurrenceEnd());
    }

    @Test
    void updateSchedule_invalidRRule_isRejectedWith400() {
        block(ScheduleType.URGENT_AVAILABLE);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();
        request.setRrule("FREQ=BAD_VALUE");

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.updateSchedule(request, 5L, professionalId));
        assertEquals(400, e.getStatusCode().value());
    }

    @Test
    void updateSchedule_invalidTzid_isRejectedWith400() {
        block(ScheduleType.URGENT_AVAILABLE);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();
        request.setTzid("Bad/Zone");

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.updateSchedule(request, 5L, professionalId));
        assertEquals(400, e.getStatusCode().value());
    }

    @Test
    void updateSchedule_unknownBlock_isNotFound() {
        when(scheduleRepository.findById(5L)).thenReturn(Optional.empty());
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();

        assertThrows(ScheduleNotFoundException.class, () -> service.updateSchedule(request, 5L, professionalId));
    }

    @Test
    void updateSchedule_someoneElsesBlock_isForbidden() {
        block(ScheduleType.USER_RESERVED);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();
        UUID stranger = UUID.randomUUID();

        assertThrows(AccessDeniedException.class, () -> service.updateSchedule(request, 5L, stranger));
    }

    @Test
    void updateSchedule_scheduledJob_cannotBeChangedByHand() {
        block(ScheduleType.SCHEDULED_JOB);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();

        assertThrows(ResponseStatusException.class, () -> service.updateSchedule(request, 5L, professionalId));
    }

    @Test
    void updateSchedule_startNotBeforeEnd_isRejected() {
        block(ScheduleType.USER_RESERVED);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();
        request.setStartTimestamp(end.plusHours(1));

        assertThrows(ResponseStatusException.class, () -> service.updateSchedule(request, 5L, professionalId));
    }

    @Test
    void updateSchedule_overlapping_isAConflict() {
        block(ScheduleType.USER_RESERVED);
        when(scheduleRepository.existsOverlapping(professionalId, start, end, 5L)).thenReturn(true);
        ScheduleUpdateRequest request = new ScheduleUpdateRequest();

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.updateSchedule(request, 5L, professionalId));
        assertEquals(409, e.getStatusCode().value());
    }

    // --- job blocks ---

    @Test
    void createJobSchedule_addsAScheduledJobBlockToTheJob() {
        JobRequest job = JobRequest.builder().id(9L).professional(professional).build();

        ScheduleResponse response = service.createJobSchedule(job, start, end);

        assertEquals(ScheduleType.SCHEDULED_JOB, response.getType());
        assertEquals(9L, response.getJobRequestId());
        assertEquals(1, job.getSchedules().size());
    }

    @Test
    void createJobSchedule_missingOrInvertedTimes_areRejected() {
        JobRequest job = JobRequest.builder().professional(professional).build();

        assertThrows(ResponseStatusException.class, () -> service.createJobSchedule(job, null, end));
        assertThrows(ResponseStatusException.class, () -> service.createJobSchedule(job, start, null));
        assertThrows(ResponseStatusException.class, () -> service.createJobSchedule(job, end, start));
        verify(scheduleRepository, never()).save(any());
    }

    private Schedule recurringBlock(ScheduleType type) {
        Schedule recurring = Schedule.builder()
                .professional(professional)
                .type(type)
                .startTimestamp(start)
                .endTimestamp(end)
                .rrule("FREQ=DAILY;COUNT=3")
                .build();
        recurring.validateAndNormalizeRecurrence();
        return recurring;
    }

    private void agendaHas(Schedule existing) {
        when(scheduleRepository.findActiveCandidates(eq(professionalId), any(), any(), anyLong()))
                .thenReturn(List.of(existing));
    }

    @Test
    void createJobSchedule_overlappingAnotherJob_isAConflict() {
        JobRequest job = JobRequest.builder().professional(professional).build();
        agendaHas(Schedule.builder().id(3L).professional(professional)
                .type(ScheduleType.SCHEDULED_JOB).startTimestamp(start).endTimestamp(end).build());

        assertThrows(ResponseStatusException.class, () -> service.createJobSchedule(job, start, end));
    }

    @Test
    void createJobSchedule_overlappingRecurringReservedBlock_isAConflict() {
        JobRequest job = JobRequest.builder().professional(professional).build();
        agendaHas(recurringBlock(ScheduleType.USER_RESERVED));

        assertThrows(ResponseStatusException.class, () -> service.createJobSchedule(job, start, end));
    }

    @Test
    void createJobSchedule_insideTheProfessionalsAvailability_isBooked() {
        JobRequest job = JobRequest.builder().id(9L).professional(professional).build();
        agendaHas(recurringBlock(ScheduleType.URGENT_AVAILABLE));

        ScheduleResponse response = service.createJobSchedule(job, start, end);

        assertEquals(ScheduleType.SCHEDULED_JOB, response.getType());
    }

    @Test
    void createJobSchedule_locksTheProfessionalsAgendaBeforeCheckingOverlaps() {
        JobRequest job = JobRequest.builder().id(9L).professional(professional).build();

        service.createJobSchedule(job, start, end);

        verify(professionalRepository).findByPublicIdForUpdate(professionalId);
    }

    private JobRequest acceptedJob() {
        JobRequest job = JobRequest.builder().id(9L).professional(professional).build();
        job.getSchedules().add(Schedule.builder().id(7L).professional(professional).jobRequest(job)
                .type(ScheduleType.SCHEDULED_JOB).startTimestamp(start).endTimestamp(end).build());
        return job;
    }

    @Test
    void moveJobSchedule_movesTheJobsBlock_ignoringItselfForOverlaps() {
        JobRequest job = acceptedJob();
        OffsetDateTime newStart = start.plusHours(1);

        ScheduleResponse response = service.moveJobSchedule(job, newStart, newStart.plusHours(2));

        verify(professionalRepository).findByPublicIdForUpdate(professionalId);
        verify(scheduleRepository).findActiveCandidates(professionalId, newStart, newStart.plusHours(2), 7L);
        assertEquals(newStart, response.getStartTimestamp());
        assertEquals(newStart, job.getSchedules().getFirst().getStartTimestamp());
    }

    @Test
    void moveJobSchedule_overlapping_isAConflict() {
        JobRequest job = acceptedJob();
        OffsetDateTime newStart = start.plusDays(1);
        OffsetDateTime newEnd = newStart.plusHours(2);
        agendaHas(Schedule.builder().id(3L).professional(professional)
                .type(ScheduleType.USER_RESERVED).startTimestamp(newStart).endTimestamp(newEnd).build());

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.moveJobSchedule(job, newStart, newEnd));
        assertEquals(409, e.getStatusCode().value());
        assertEquals(start, job.getSchedules().getFirst().getStartTimestamp());
    }

    @Test
    void moveJobSchedule_invertedTimes_areRejected() {
        JobRequest job = acceptedJob();

        assertThrows(ResponseStatusException.class, () -> service.moveJobSchedule(job, end, start));
        verify(scheduleRepository, never()).save(any());
    }

    @Test
    void checkJobSlotAvailable_proposalWithoutABlock_checksTheWholeAgenda() {
        JobRequest job = JobRequest.builder().professional(professional).build();
        agendaHas(Schedule.builder().id(3L).professional(professional)
                .type(ScheduleType.SCHEDULED_JOB).startTimestamp(start).endTimestamp(end).build());

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.checkJobSlotAvailable(job, start, end));
        verify(scheduleRepository).findActiveCandidates(professionalId, start, end, 0L);
        assertEquals(HttpStatus.CONFLICT, e.getStatusCode());
    }

    @Test
    void releaseJobSchedule_deletesOnlyTheScheduledJobBlocks() {
        Schedule jobBlock = Schedule.builder().type(ScheduleType.SCHEDULED_JOB).build();
        Schedule other = Schedule.builder().type(ScheduleType.USER_RESERVED).build();
        JobRequest job = JobRequest.builder().build();
        job.getSchedules().addAll(List.of(jobBlock, other));

        service.releaseJobSchedule(job);

        verify(scheduleRepository).deleteAll(List.of(jobBlock));
        assertEquals(List.of(other), job.getSchedules());
    }

    // --- agenda ---

    private Schedule jobBlock() {
        return Schedule.builder().id(7L).professional(professional).type(ScheduleType.SCHEDULED_JOB)
                .jobRequest(JobRequest.builder().id(9L).build()).startTimestamp(start).endTimestamp(end).build();
    }

    @Test
    void getAgenda_owner_seesWhichJobEachBlockBelongsTo() {
        when(professionalRepository.existsByPublicId(professionalId)).thenReturn(true);
        when(scheduleRepository.findAgenda(professionalId, null, null)).thenReturn(List.of(jobBlock()));

        List<ScheduleResponse> agenda = service.getAgenda(professionalId, null, null, true);

        assertEquals(9L, agenda.getFirst().getJobRequestId());
    }

    @Test
    void getAgenda_public_hidesTheJob() {
        when(professionalRepository.existsByPublicIdAndPublishedTrue(professionalId)).thenReturn(true);
        when(scheduleRepository.findAgenda(professionalId, null, null)).thenReturn(List.of(jobBlock()));

        List<ScheduleResponse> agenda = service.getAgenda(professionalId, null, null, false);

        assertNull(agenda.getFirst().getJobRequestId());
    }

    @Test
    void getAgenda_expandsRecurringScheduleAndSkipsExdates() {
        OffsetDateTime day1Start = OffsetDateTime.of(2030, 5, 6, 9, 0, 0, 0, ZoneOffset.ofHours(-3));
        OffsetDateTime day1End = OffsetDateTime.of(2030, 5, 6, 12, 0, 0, 0, ZoneOffset.ofHours(-3));
        Schedule recurring = Schedule.builder()
                .id(15L)
                .professional(professional)
                .type(ScheduleType.URGENT_AVAILABLE)
                .startTimestamp(day1Start)
                .endTimestamp(day1End)
                .rrule("FREQ=DAILY;COUNT=4")
                .exdates(List.of(day1Start.plusDays(1)))
                .build();
        recurring.validateAndNormalizeRecurrence();

        when(professionalRepository.existsByPublicIdAndPublishedTrue(professionalId)).thenReturn(true);
        when(scheduleRepository.findAgenda(professionalId, day1Start, day1Start.plusDays(5)))
                .thenReturn(List.of(recurring));

        List<ScheduleResponse> agenda = service.getAgenda(professionalId, day1Start, day1Start.plusDays(5), false);

        assertEquals(3, agenda.size());
        assertEquals(day1Start, agenda.get(0).getStartTimestamp());
        assertEquals(day1Start.plusDays(2), agenda.get(1).getStartTimestamp());
        assertEquals(day1Start.plusDays(3), agenda.get(2).getStartTimestamp());
    }

    @Test
    void exportAgendaICalendar_rendersValidRFC5545Document() {
        OffsetDateTime blockStart = OffsetDateTime.of(2030, 5, 6, 9, 0, 0, 0, ZoneOffset.UTC);
        OffsetDateTime blockEnd = OffsetDateTime.of(2030, 5, 6, 11, 0, 0, 0, ZoneOffset.UTC);
        Schedule recurring = Schedule.builder()
                .id(21L)
                .professional(professional)
                .type(ScheduleType.URGENT_AVAILABLE)
                .startTimestamp(blockStart)
                .endTimestamp(blockEnd)
                .rrule("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6")
                .build();

        when(professionalRepository.existsByPublicId(professionalId)).thenReturn(true);
        when(scheduleRepository.findAgenda(professionalId, null, null)).thenReturn(List.of(recurring));

        String ics = service.exportAgendaICalendar(professionalId, null, null, true);

        assertTrue(ics.startsWith("BEGIN:VCALENDAR\r\n"));
        assertTrue(ics.contains("RRULE:FREQ=WEEKLY;COUNT=6;BYDAY=MO,WE,FR\r\n"));
        assertTrue(ics.endsWith("END:VCALENDAR\r\n"));
    }

    @Test
    void exportAgendaICalendar_publicView_requiresPublishedProfessional() {
        when(professionalRepository.existsByPublicIdAndPublishedTrue(professionalId)).thenReturn(true);
        when(scheduleRepository.findAgenda(professionalId, null, null)).thenReturn(List.of(jobBlock()));

        String ics = service.exportAgendaICalendar(professionalId, null, null, false);
        assertTrue(ics.contains("BEGIN:VCALENDAR\r\n"));

        when(professionalRepository.existsByPublicIdAndPublishedTrue(professionalId)).thenReturn(false);
        assertThrows(ClientNotFoundException.class,
                () -> service.exportAgendaICalendar(professionalId, null, null, false));
    }

    @Test
    void getAgenda_unpublishedProfessional_isNotFoundForThePublic() {
        when(professionalRepository.existsByPublicIdAndPublishedTrue(professionalId)).thenReturn(false);

        assertThrows(ClientNotFoundException.class, () -> service.getAgenda(professionalId, null, null, false));
    }

    @Test
    void listAllSchedules_mapsEveryBlock() {
        when(scheduleRepository.findAll()).thenReturn(List.of(jobBlock()));

        assertEquals(1, service.listAllSchedules().size());
    }

    // --- delete ---

    @Test
    void deleteSchedule_removesTheOwnersBlock() {
        Schedule schedule = block(ScheduleType.URGENT_AVAILABLE);

        service.deleteSchedule(5L, professionalId);

        verify(scheduleRepository).delete(schedule);
    }

    @Test
    void deleteSchedule_unknownBlock_isNotFound() {
        when(scheduleRepository.findById(5L)).thenReturn(Optional.empty());

        assertThrows(ScheduleNotFoundException.class, () -> service.deleteSchedule(5L, professionalId));
    }

    @Test
    void deleteSchedule_someoneElsesBlock_isForbidden() {
        block(ScheduleType.URGENT_AVAILABLE);
        UUID stranger = UUID.randomUUID();

        assertThrows(AccessDeniedException.class, () -> service.deleteSchedule(5L, stranger));
    }

    @Test
    void deleteSchedule_scheduledJob_cannotBeDeletedByHand() {
        block(ScheduleType.SCHEDULED_JOB);

        assertThrows(ResponseStatusException.class, () -> service.deleteSchedule(5L, professionalId));
        verify(scheduleRepository, never()).delete(any());
    }
}
