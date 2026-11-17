package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.mapper.JobRequestMapperImpl;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway.Payment;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
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
    private ScheduleService scheduleService;
    @Mock
    private ApplicationEventPublisher events;

    private PaymentServiceImpl service;

    private final UUID clientId = UUID.randomUUID();
    private Client client;
    private Professional professional;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new PaymentServiceImpl(jobRequestRepository, new JobRequestMapperImpl(), paymentGateway, scheduleService, events,
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
        assertEquals(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC), job.getPaidAt());
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

        verify(paymentGateway).refund("123", job);
        assertEquals("999", job.getMpPaymentId());
    }

    @Test
    void aPaymentForACancelledJob_isRefunded() {
        JobRequest job = job(JobStatus.CANCELLED, PaymentState.PENDING);
        mpSays("approved", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        verify(paymentGateway).refund("123", job);
        assertEquals(PaymentState.PENDING, job.getPaymentState());
    }

    @Test
    void aPaymentOfAnotherAmountOrCurrency_isRefundedAndDoesntHoldTheJob() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.PENDING);
        mpSays("approved", "1", "UYU", "10");

        service.handlePaymentNotification("123");

        verify(paymentGateway).refund("123", job);
        assertEquals(PaymentState.PENDING, job.getPaymentState());
    }

    @Test
    void aPaymentWithoutAKnownJob_isIgnored() {
        mpSays("approved", "1500", "UYU", "not-a-job");

        service.handlePaymentNotification("123");

        verify(paymentGateway, never()).refund(any(), any());
    }

    // --- reversals ---

    @Test
    void aChargebackOnAHeldPayment_cancelsTheJob() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.RETAINED);
        job.setMpPaymentId("123");
        mpSays("charged_back", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        assertEquals(PaymentState.REFUNDED, job.getPaymentState());
        assertEquals(JobStatus.CANCELLED, job.getStatus());
        assertEquals(PaymentServiceImpl.REVERSAL_REASON, job.getCancellationReason());
        verify(scheduleService).releaseJobSchedule(job);
        verify(events).publishEvent(new JobRequestEvents.JobStatusChanged(10L, JobRequestEvents.Change.REFUNDED, null));
        verify(paymentGateway, never()).refund(any(), any());
    }

    @Test
    void aRefundFromThePanel_afterThePin_leavesThePendingPayouts_keepingTheJobCompleted() {
        JobRequest job = job(JobStatus.COMPLETED, PaymentState.PAID);
        job.setMpPaymentId("123");
        mpSays("refunded", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        assertEquals(PaymentState.REFUNDED, job.getPaymentState());
        assertEquals(JobStatus.COMPLETED, job.getStatus());
        verify(scheduleService, never()).releaseJobSchedule(any());
    }

    @Test
    void theRefundOfADuplicatePayment_doesntTouchThePaymentTheJobHolds() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.RETAINED);
        job.setMpPaymentId("999");
        mpSays("refunded", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        assertEquals(PaymentState.RETAINED, job.getPaymentState());
        assertEquals(JobStatus.ACCEPTED, job.getStatus());
    }

    @Test
    void theNotificationOfARefundWeMade_changesNothing() {
        JobRequest job = job(JobStatus.CANCELLED, PaymentState.REFUNDED);
        job.setMpPaymentId("123");
        mpSays("refunded", "1500", "UYU", "10");

        service.handlePaymentNotification("123");

        verify(jobRequestRepository, never()).save(any());
    }

    // --- admin refund ---

    @Test
    void refundRetained_givesTheMoneyBackAndCancelsTheJob() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.RETAINED);
        job.setMpPaymentId("123");

        assertEquals(PaymentState.REFUNDED, service.refundRetained(10L).getPaymentState());

        verify(paymentGateway).refund("123", job);
        verify(scheduleService).releaseJobSchedule(job);
        assertEquals(JobStatus.CANCELLED, job.getStatus());
        assertEquals(PaymentServiceImpl.REFUND_REASON, job.getCancellationReason());
    }

    @Test
    void refundRetained_whenMercadoPagoFails_leavesTheJobAsItWas() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.RETAINED);
        job.setMpPaymentId("123");
        doThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY)).when(paymentGateway).refund("123", job);

        assertThrows(ResponseStatusException.class, () -> service.refundRetained(10L));

        assertEquals(PaymentState.RETAINED, job.getPaymentState());
        assertEquals(JobStatus.ACCEPTED, job.getStatus());
    }

    @Test
    void refundRetained_ofAnythingElse_isRejected() {
        job(JobStatus.COMPLETED, PaymentState.PAID);

        assertThrows(ResponseStatusException.class, () -> service.refundRetained(10L));
        verify(paymentGateway, never()).refund(any(), any());
    }

    @Test
    void listRetained_isTheHeldPayments() {
        JobRequest job = job(JobStatus.ACCEPTED, PaymentState.RETAINED);
        when(jobRequestRepository.findByPaymentStateOrderByPaidAtAsc(PaymentState.RETAINED)).thenReturn(List.of(job));

        assertEquals(10L, service.listRetained().getFirst().getId());
    }

    // --- payouts ---

    @Test
    void pendingPayouts_areThePaidJobsNotTransferredYet() {
        JobRequest job = job(JobStatus.COMPLETED, PaymentState.PAID);
        when(jobRequestRepository.findByPaymentStateAndPayoutAtIsNullOrderByUpdatedAtAsc(PaymentState.PAID))
                .thenReturn(List.of(job));

        professional.setPayoutAccount("BROU 001234567-00001");

        List<JobRequestResponse> payouts = service.listPendingPayouts();
        assertEquals(1, payouts.size());
        assertEquals("BROU 001234567-00001", payouts.getFirst().getProfessionalPayoutAccount());
        assertFalse(payouts.getFirst().isProfessionalPayoutVerified());

        professional.setPayoutMpUserId("987");
        assertTrue(service.listPendingPayouts().getFirst().isProfessionalPayoutVerified());
    }

    @Test
    void payoutHistory_isTheTransfersMade_withWhereTheyWent() {
        JobRequest job = job(JobStatus.COMPLETED, PaymentState.PAID);
        job.setPayoutAt(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        professional.setPayoutAccount("BROU · 001234567-00001 · Beto");
        when(jobRequestRepository.findByPayoutAtIsNotNullOrderByPayoutAtDesc()).thenReturn(List.of(job));

        List<JobRequestResponse> history = service.listPayoutHistory();
        assertEquals(1, history.size());
        assertEquals("BROU · 001234567-00001 · Beto", history.getFirst().getProfessionalPayoutAccount());
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
