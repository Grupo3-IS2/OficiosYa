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
import com.um.uy.oficiosya.mapper.ScheduleMapperImpl;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.ScheduleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A professional's agenda: manual blocks, the SCHEDULED_JOB blocks that jobs create, and who sees what. */
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
        professional = Professional.builder().id(1L).publicId(professionalId).name("Beto").build();
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

        assertThrows(UserNotFoundException.class, () -> service.createSchedule(request, professionalId));
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

    @Test
    void createJobSchedule_overlapping_isAConflict() {
        JobRequest job = JobRequest.builder().professional(professional).build();
        when(scheduleRepository.existsOverlapping(eq(professionalId), any(), any(), anyLong())).thenReturn(true);

        assertThrows(ResponseStatusException.class, () -> service.createJobSchedule(job, start, end));
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
        verify(scheduleRepository).existsOverlapping(professionalId, newStart, newStart.plusHours(2), 7L);
        assertEquals(newStart, response.getStartTimestamp());
        assertEquals(newStart, job.getSchedules().getFirst().getStartTimestamp());
    }

    @Test
    void moveJobSchedule_overlapping_isAConflict() {
        JobRequest job = acceptedJob();
        when(scheduleRepository.existsOverlapping(eq(professionalId), any(), any(), eq(7L))).thenReturn(true);
        OffsetDateTime newStart = start.plusDays(1);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.moveJobSchedule(job, newStart, newStart.plusHours(2)));
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
    void checkJobSlotAvailable_jobWithoutABlock_isNotFound() {
        JobRequest job = JobRequest.builder().professional(professional).build();

        assertThrows(ScheduleNotFoundException.class, () -> service.checkJobSlotAvailable(job, start, end));
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
    void getAgenda_unpublishedProfessional_isNotFoundForThePublic() {
        when(professionalRepository.existsByPublicIdAndPublishedTrue(professionalId)).thenReturn(false);

        assertThrows(UserNotFoundException.class, () -> service.getAgenda(professionalId, null, null, false));
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
