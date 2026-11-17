package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import com.um.uy.oficiosya.exception.JobRequestNotFoundException;
import com.um.uy.oficiosya.mapper.JobRequestMapper;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import com.um.uy.oficiosya.service.interfaces.PaymentService;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@Slf4j
public class PaymentServiceImpl implements PaymentService {

    /** A job is paid once both sides committed to it, and until it's done. */
    static final Set<JobStatus> PAYABLE = Set.of(JobStatus.ACCEPTED, JobStatus.RESCHEDULE_REQUESTED);
    private static final String CURRENCY = "UYU";
    static final String REFUND_REASON = "Un administrador le devolvió el pago al cliente";
    static final String REVERSAL_REASON = "El pago se revirtió en Mercado Pago";

    private final JobRequestRepository jobRequestRepository;
    private final JobRequestMapper jobRequestMapper;
    private final PaymentGateway paymentGateway;
    private final ScheduleService scheduleService;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public PaymentServiceImpl(JobRequestRepository jobRequestRepository,
                              JobRequestMapper jobRequestMapper,
                              PaymentGateway paymentGateway,
                              ScheduleService scheduleService,
                              ApplicationEventPublisher events,
                              Clock clock) {
        this.jobRequestRepository = jobRequestRepository;
        this.jobRequestMapper = jobRequestMapper;
        this.paymentGateway = paymentGateway;
        this.scheduleService = scheduleService;
        this.events = events;
        this.clock = clock;
    }

    @Override
    @Transactional // not read-only: may save the professional's refreshed Mercado Pago token
    public String startPayment(Long jobRequestId, UUID clientId) {
        JobRequest job = find(jobRequestId);

        if (!job.getClient().getPublicId().equals(clientId)) {
            throw new AccessDeniedException("Solo el cliente del trabajo puede pagarlo");
        }
        if (!PAYABLE.contains(job.getStatus()) || job.getPaymentState() != PaymentState.PENDING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este trabajo no tiene un pago pendiente");
        }
        // Jobs from before the amount had to be positive: Mercado Pago can't charge 0
        if (job.getPaymentAmount().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este trabajo no tiene un monto a pagar");
        }

        return paymentGateway.createCheckout(job);
    }

    @Override
    @Transactional
    public void handlePaymentNotification(String paymentId) {
        PaymentGateway.Payment payment = paymentGateway.getPayment(paymentId);
        if (payment.isReversed()) {
            handleReversal(paymentId, payment);
            return;
        }
        // Pending or rejected: nothing to hold
        if (!payment.isApproved()) return;

        JobRequest job = jobOf(payment);
        if (job == null) {
            log.warn("Approved payment {} has no job (external_reference {})", paymentId, payment.externalReference());
            return;
        }
        // Mercado Pago repeats notifications
        if (paymentId.equals(job.getMpPaymentId())) return;

        boolean rightAmount = payment.amount() != null && payment.amount().compareTo(job.getPaymentAmount()) == 0
                && CURRENCY.equals(payment.currency());
        if (rightAmount && PAYABLE.contains(job.getStatus()) && job.getPaymentState() == PaymentState.PENDING) {
            job.setPaymentState(PaymentState.RETAINED);
            job.setMpPaymentId(paymentId);
            job.setPaidAt(OffsetDateTime.now(clock));
            job = jobRequestRepository.save(job);
            events.publishEvent(new JobRequestEvents.JobStatusChanged(job.getId(), JobRequestEvents.Change.PAID,
                    job.getClient().getPublicId()));
            log.info("Payment {} holds job {}", paymentId, job.getId());
            return;
        }

        // Paid twice, paid after it was cancelled, or a different amount: the money isn't ours to keep
        log.warn("Refunding payment {} of job {}: job {} / {}, amount {} {}", paymentId, job.getId(),
                job.getStatus(), job.getPaymentState(), payment.amount(), payment.currency());
        paymentGateway.refund(paymentId, job);
    }

    /**
     * The money went back without the job being cancelled here (a chargeback, or a refund from Mercado Pago's panel),
     * so it must not reach the professional. A refund we made finds the job REFUNDED, or is not the payment it holds.
     */
    private void handleReversal(String paymentId, PaymentGateway.Payment payment) {
        JobRequest job = jobOf(payment);
        if (job == null || !paymentId.equals(job.getMpPaymentId())) return;

        if (job.getPaymentState() == PaymentState.RETAINED) {
            log.warn("Payment {} holding job {} was reversed: cancelling the job", paymentId, job.getId());
            cancelRefunded(job, REVERSAL_REASON);
        } else if (job.getPaymentState() == PaymentState.PAID) {
            // A completed job stays completed; without PAID it just leaves the pending payouts
            if (job.getPayoutAt() != null) {
                log.error("Payment {} of job {} was reversed after the professional was transferred their share: "
                        + "OficiosYa is out of that money", paymentId, job.getId());
            }
            job.setPaymentState(PaymentState.REFUNDED);
            jobRequestRepository.save(job);
        }
    }

    /** A RETAINED job is always still accepted: the money is gone, so the job is too. */
    private JobRequest cancelRefunded(JobRequest job, String reason) {
        scheduleService.releaseJobSchedule(job);
        job.setPaymentState(PaymentState.REFUNDED);
        job.setStatus(JobStatus.CANCELLED);
        job.setCancelledBy(null);
        job.setCancellationReason(reason);
        job.clearReschedule();
        JobRequest saved = jobRequestRepository.save(job);
        events.publishEvent(new JobRequestEvents.JobStatusChanged(saved.getId(), JobRequestEvents.Change.REFUNDED, null));
        events.publishEvent(new JobRequestEvents.AwaitingAnswersChanged(Set.of(
                saved.getClient().getPublicId(), saved.getProfessional().getPublicId())));
        return saved;
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> listRetained() {
        return jobRequestRepository.findByPaymentStateOrderByPaidAtAsc(PaymentState.RETAINED).stream()
                .map(jobRequestMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public JobRequestResponse refundRetained(Long jobRequestId) {
        JobRequest job = find(jobRequestId);
        if (job.getPaymentState() != PaymentState.RETAINED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este trabajo no tiene un pago retenido");
        }
        // Before the change: if Mercado Pago fails, the job stays as it was instead of cancelled without the refund
        paymentGateway.refund(job.getMpPaymentId(), job);
        return jobRequestMapper.toResponse(cancelRefunded(job, REFUND_REASON));
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> listPendingPayouts() {
        return jobRequestRepository.findByPaymentStateAndPayoutAtIsNullOrderByUpdatedAtAsc(PaymentState.PAID).stream()
                .map(this::toPayoutResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> listPayoutHistory() {
        return jobRequestRepository.findByPayoutAtIsNotNullOrderByPayoutAtDesc().stream()
                .map(this::toPayoutResponse)
                .toList();
    }

    /** With where the professional is paid, which only the admin's payout lists show. */
    private JobRequestResponse toPayoutResponse(JobRequest job) {
        JobRequestResponse response = jobRequestMapper.toResponse(job);
        response.setProfessionalPayoutAccount(job.getProfessional().getPayoutAccount());
        response.setProfessionalPayoutVerified(job.getProfessional().getPayoutMpUserId() != null);
        return response;
    }

    @Override
    @Transactional
    public JobRequestResponse markPaidOut(Long jobRequestId) {
        JobRequest job = find(jobRequestId);
        if (job.getPaymentState() != PaymentState.PAID || job.getPayoutAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Este trabajo no tiene una transferencia pendiente al profesional");
        }
        job.setPayoutAt(OffsetDateTime.now(clock));
        return jobRequestMapper.toResponse(jobRequestRepository.save(job));
    }

    private JobRequest jobOf(PaymentGateway.Payment payment) {
        try {
            return jobRequestRepository.findById(Long.valueOf(payment.externalReference())).orElse(null);
        } catch (NumberFormatException _) {
            return null;
        }
    }

    private JobRequest find(Long id) {
        return jobRequestRepository.findById(id)
                .orElseThrow(() -> new JobRequestNotFoundException("Trabajo no encontrado."));
    }
}
