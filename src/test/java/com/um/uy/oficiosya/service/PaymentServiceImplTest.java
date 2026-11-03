package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.mapper.JobRequestMapperImpl;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway.Payment;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Starting a payment, holding it when Mercado Pago confirms it, and the admin's payouts. */
class PaymentServiceImplTest {

    private static final Instant NOW = Instant.parse("2026-11-02T12:00:00Z");

    @Mock
    private JobRequestRepository jobRequestRepository;
    @Mock
    private PaymentGateway paymentGateway;
    @Mock
    private ApplicationEventPublisher events;

    private PaymentServiceImpl service;

    private final UUID clientId = UUID.randomUUID();
    private Client client;
    private Professional professional;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new PaymentServiceImpl(jobRequestRepository, new JobRequestMapperImpl(), paymentGateway, events,
                Clock.fixed(NOW, ZoneOffset.UTC));
        client = Client.builder().id(1L).publicId(clientId).name("Ana").email("ana@example.com").build();
        professional = Professional.builder().id(2L).publicId(UUID.randomUUID()).name("Beto").build();
        when(jobRequestRepository.save(any(JobRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private JobRequest job(JobStatus status, PaymentState paymentState) {
        JobRequest job = JobRequest.builder().id(10L).client(client).professional(professional).location("Montevideo")
                .paymentAmount(new BigDecimal("1500.00")).status(status).paymentState(paymentState).build();
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.of(job));
        return job;
    }

    private void mpSays(String status, String amount, String currency, String reference) {
        when(paymentGateway.getPayment("123"))
                .thenReturn(new Payment("123", status, new BigDecimal(amount), currency, reference));
    }

    // --- start ---

    @Test
    void startPayment_givesTheClientTheCheckout() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.PENDING);
        when(paymentGateway.createCheckout(job)).thenReturn("https://mp/checkout");

        assertEquals("https://mp/checkout", service.startPayment(10L, clientId));
    }

    @Test
    void startPayment_bySomeoneElse_isForbidden() {
        job(JobStatus.ACCEPTED, PaymentState.PENDING);
        UUID professionalId = professional.getPublicId();

        assertThrows(AccessDeniedException.class, () -> service.startPayment(10L, professionalId));
    }

    @Test
    void startPayment_withNothingPending_isRejected() {
        job(JobStatus.PROPOSED, PaymentState.PENDING);
        assertThrows(ResponseStatusException.class, () -> service.startPayment(10L, clientId));

        job(JobStatus.ACCEPTED, PaymentState.RETAINED);
        assertThrows(ResponseStatusException.class, () -> service.startPayment(10L, clientId));

        job(JobStatus.ACCEPTED, PaymentState.PENDING).setPaymentAmount(BigDecimal.ZERO);
        assertThrows(ResponseStatusException.class, () -> service.startPayment(10L, clientId));
        verify(paymentGateway, never()).createCheckout(any());
    }

    // --- notifications ---

    @Test
    void anApprovedPayment_holdsTheMoneyOnItsJob() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.PENDING);
        mpSays("approved", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        assertEquals(PaymentState.RETAINED, job.getPaymentState());
        assertEquals("123", job.getMpPaymentId());
        verify(events).publishEvent(new JobRequestEvents.JobStatusChanged(10L, JobRequestEvents.Change.PAID, clientId));
        verify(paymentGateway, never()).refund(any(), any());
    }

    @Test
    void aRepeatedNotification_changesNothing() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.RETAINED);
        job.setMpPaymentId("123");
        mpSays("approved", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        verify(jobRequestRepository, never()).save(any());
        verify(paymentGateway, never()).refund(any(), any());
    }

    @Test
    void aPaymentNotApprovedYet_changesNothing() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.PENDING);
        mpSays("in_process", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        assertEquals(PaymentState.PENDING, job.getPaymentState());
        verify(paymentGateway, never()).refund(any(), any());
    }

    @Test
    void aSecondPaymentForAPaidJob_isRefunded() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.RETAINED);
        job.setMpPaymentId("999");
        mpSays("approved", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        verify(paymentGateway).refund("123", 10L);
        assertEquals("999", job.getMpPaymentId());
    }

    @Test
    void aPaymentForACancelledJob_isRefunded() {
        JobRequest job = job(JobStatus.CANCELLED, PaymentState.PENDING);
        mpSays("approved", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        verify(paymentGateway).refund("123", 10L);
        assertEquals(PaymentState.PENDING, job.getPaymentState());
    }

    @Test
    void aPaymentOfAnotherAmountOrCurrency_isRefundedAndDoesntHoldTheJob() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.PENDING);
        mpSays("approved", "1", "UYU", "10");

        service.handlePaymentNotification("123");

        verify(paymentGateway).refund("123", 10L);
        assertEquals(PaymentState.PENDING, job.getPaymentState());
    }

    @Test
    void aPaymentWithoutAKnownJob_isIgnored() {
        mpSays("approved", "1500", "UYU", "not-a-job");

        service.handlePaymentNotification("123");

        verify(paymentGateway, never()).refund(any(), any());
    }

    // --- payouts ---

    @Test
    void pendingPayouts_areThePaidJobsNotTransferredYet() {
        JobRequest job = job(JobStatus.COMPLETED, PaymentState.PAID);
        when(jobRequestRepository.findByPaymentStateAndPayoutAtIsNullOrderByUpdatedAtAsc(PaymentState.PAID))
                .thenReturn(List.of(job));

        assertEquals(1, service.listPendingPayouts().size());
    }

    @Test
    void markPaidOut_recordsWhen_once() {
        JobRequest job = job(JobStatus.COMPLETED, PaymentState.PAID);

        assertEquals(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC), service.markPaidOut(10L).getPayoutAt());
        assertThrows(ResponseStatusException.class, () -> service.markPaidOut(10L));

        job.setPayoutAt(null);
        job.setPaymentState(PaymentState.RETAINED);
        assertThrows(ResponseStatusException.class, () -> service.markPaidOut(10L));
        assertNull(job.getPayoutAt());
    }
}
