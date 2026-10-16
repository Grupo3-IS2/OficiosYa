package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.response.ChatJobSummary;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** The timeframe a "Trabajo propuesto" card shows in each state. */
class ChatMapperTest {

    private final ChatMapper mapper = new ChatMapperImpl();
    private final OffsetDateTime proposed = OffsetDateTime.parse("2026-10-16T10:00:00-03:00");
    private final OffsetDateTime scheduled = OffsetDateTime.parse("2026-10-17T14:00:00-03:00");

    private JobRequest job(JobStatus status, Role proposedBy) {
        return JobRequest.builder().id(87L).status(status).proposedBy(proposedBy)
                .location("Av. Italia 1234").paymentAmount(BigDecimal.valueOf(1500)).build();
    }

    @Test
    void aProfessionalsProposal_showsTheTimeframeTheyOffered() {
        JobRequest job = job(JobStatus.PROPOSED, Role.PROFESSIONAL);
        job.setProposedStart(proposed);
        job.setProposedEnd(proposed.plusHours(2));

        ChatJobSummary summary = mapper.toSummary(job);

        assertEquals(proposed, summary.getStart());
        assertEquals(proposed.plusHours(2), summary.getEnd());
        assertEquals("Av. Italia 1234", summary.getLocation());
    }

    @Test
    void aClientsProposal_hasNoTimeframeUntilAccepted() {
        ChatJobSummary summary = mapper.toSummary(job(JobStatus.PROPOSED, Role.CLIENT));

        assertNull(summary.getStart());
        assertNull(summary.getEnd());
    }

    @Test
    void onceAccepted_showsTheScheduledBlock_andWhileRescheduling_alsoTheOneAskedFor() {
        JobRequest job = job(JobStatus.RESCHEDULE_REQUESTED, Role.CLIENT);
        job.getSchedules().add(Schedule.builder().type(ScheduleType.SCHEDULED_JOB)
                .startTimestamp(scheduled).endTimestamp(scheduled.plusHours(2)).build());
        job.setRescheduleStart(scheduled.plusDays(1));

        ChatJobSummary summary = mapper.toSummary(job);

        assertEquals(scheduled, summary.getStart());
        assertEquals(scheduled.plusDays(1), summary.getRescheduleStart());
    }

    @Test
    void aRejectedProfessionalsProposal_stillShowsWhatWasOffered() {
        JobRequest job = job(JobStatus.REJECTED, Role.PROFESSIONAL);
        job.setProposedStart(proposed);
        job.setProposedEnd(proposed.plusHours(2));

        assertEquals(proposed, mapper.toSummary(job).getStart());
    }
}
