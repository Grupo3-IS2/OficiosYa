package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Set;

/**
 * Cancels accepted jobs the client didn't pay by the time they could still be cancelled (start minus
 * JOB_MIN_NOTICE_HOURS), freeing the professional's agenda. Nothing to refund: nothing was paid.
 */
@Component
@Slf4j
public class UnpaidJobCleanup {

    static final String REASON = "No se pagó a tiempo";

    private final JobRequestRepository jobRequestRepository;
    private final ScheduleService scheduleService;
    private final PaymentGateway paymentGateway;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final Duration minNotice;

    public UnpaidJobCleanup(JobRequestRepository jobRequestRepository,
                            ScheduleService scheduleService,
                            PaymentGateway paymentGateway,
                            ApplicationEventPublisher events,
                            Clock clock,
                            @Value("${app.job-request.min-notice-hours}") long minNoticeHours) {
        this.jobRequestRepository = jobRequestRepository;
        this.scheduleService = scheduleService;
        this.paymentGateway = paymentGateway;
        this.events = events;
        this.clock = clock;
        this.minNotice = Duration.ofHours(minNoticeHours);
    }

    // shortcut: one transaction for the whole batch, so one job failing retries them all next run; fine at this volume
    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT2M")
    @Transactional
    public void cancelUnpaid() {
        // With payments off nobody can pay, so nothing is overdue
        if (!paymentGateway.isEnabled()) return;

        for (JobRequest job : jobRequestRepository.findUnpaidStartingBefore(OffsetDateTime.now(clock).plus(minNotice))) {
            scheduleService.releaseJobSchedule(job);
            job.setStatus(JobStatus.CANCELLED);
            job.setCancelledBy(null);
            job.setCancellationReason(REASON);
            job.clearReschedule();
            jobRequestRepository.save(job);
            events.publishEvent(new JobRequestEvents.JobStatusChanged(job.getId(),
                    JobRequestEvents.Change.PAYMENT_EXPIRED, null));
            events.publishEvent(new JobRequestEvents.AwaitingAnswersChanged(Set.of(
                    job.getClient().getPublicId(), job.getProfessional().getPublicId())));
            log.info("Job {} cancelled: not paid in time", job.getId());
        }
    }
}
