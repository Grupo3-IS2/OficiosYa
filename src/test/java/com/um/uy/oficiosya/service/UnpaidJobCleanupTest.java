package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UnpaidJobCleanupTest {

    private static final Instant NOW = Instant.parse("2026-11-02T12:00:00Z");

    @Mock
    private JobRequestRepository jobRequestRepository;
    @Mock
    private ScheduleService scheduleService;
    @Mock
    private PaymentGateway paymentGateway;
    @Mock
    private ApplicationEventPublisher events;

    private UnpaidJobCleanup cleanup;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        cleanup = new UnpaidJobCleanup(jobRequestRepository, scheduleService, paymentGateway, events,
                Clock.fixed(NOW, ZoneOffset.UTC), 24);
    }

    @Test
    void cancelsTheUnpaidJobsPastTheNoticeDeadline_andFreesTheAgenda() {
        JobRequest job = JobRequest.builder().id(10L).status(JobStatus.ACCEPTED).paymentAmount(BigDecimal.TEN)
                .client(Client.builder().publicId(UUID.randomUUID()).build())
                .professional(Professional.builder().publicId(UUID.randomUUID()).build()).build();
        when(paymentGateway.isEnabled()).thenReturn(true);
        // The deadline is the job's start minus the notice: jobs starting in less than 24 h
        when(jobRequestRepository.findUnpaidStartingBefore(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusHours(24)))
                .thenReturn(List.of(job));

        cleanup.cancelUnpaid();

        assertEquals(JobStatus.CANCELLED, job.getStatus());
        assertEquals(UnpaidJobCleanup.REASON, job.getCancellationReason());
        assertNull(job.getCancelledBy());
        verify(scheduleService).releaseJobSchedule(job);
        verify(jobRequestRepository).save(job);
        verify(events).publishEvent(new JobRequestEvents.JobStatusChanged(10L,
                JobRequestEvents.Change.PAYMENT_EXPIRED, null));
    }

    @Test
    void withPaymentsOff_cancelsNothing() {
        cleanup.cancelUnpaid();

        verify(jobRequestRepository, never()).findUnpaidStartingBefore(any());
    }
}
