package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.update.ScheduleUpdateRequest;
import com.um.uy.oficiosya.entity.JobRequest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ScheduleService {
    ScheduleResponse createSchedule(ScheduleCreateRequest scheduleRequest, UUID professionalId);
    ScheduleResponse updateSchedule(ScheduleUpdateRequest scheduleRequest, Long id, UUID professionalId);
    List<ScheduleResponse> getAgenda(UUID professionalId, LocalDateTime from, LocalDateTime to);
    void deleteSchedule(Long id, UUID professionalId);

    /**
     * Blocks the professional's agenda for a job that was just accepted. Not exposed through a
     * controller: it's meant to be called by the job-acceptance flow, never directly by a client.
     */
    ScheduleResponse createJobSchedule(JobRequest jobRequest, LocalDateTime start, LocalDateTime end);

    /** Frees the SCHEDULED_JOB block(s) tied to a job that was rejected or cancelled after acceptance. */
    void releaseJobSchedule(JobRequest jobRequest);

    /** Every schedule block in the platform, regardless of which professional it belongs to. Admin-only. */
    List<ScheduleResponse> listAllSchedules();
}
