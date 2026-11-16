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

    private final JobRequestRepository jobRequestRepository;
    private final JobRequestMapper jobRequestMapper;
    private final PaymentGateway paymentGateway;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public PaymentServiceImpl(JobRequestRepository jobRequestRepository,
                              JobRequestMapper jobRequestMapper,
                              PaymentGateway paymentGateway,
                              ApplicationEventPublisher events,
                              Clock clock) {
        this.jobRequestRepository = jobRequestRepository;
        this.jobRequestMapper = jobRequestMapper;
        this.paymentGateway = paymentGateway;
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
    public void handlePaymentNotification(String paymentId, Long jobRequestId) {
        JobRequest notified = jobRequestId == null ? null : jobRequestRepository.findById(jobRequestId).orElse(null);
        PaymentGateway.Payment payment = paymentGateway.getPayment(paymentId, notified);
        // Pending, rejected or already refunded: nothing to hold (a refund we made comes back as "refunded")
        if (!payment.isApproved()) return;

        JobRequest job = jobOf(payment);
        // ?job= isn't signed: the payment, read with that job's token, must say it is for that same job
        if (job == null || (notified != null && !notified.getId().equals(job.getId()))) {
            log.warn("Approved payment {} has no job (external_reference {}, notified for {})", paymentId,
                    payment.externalReference(), jobRequestId);
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

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> listPendingRefunds() {
        return jobRequestRepository.findByStatusAndPaymentStateOrderByUpdatedAtAsc(JobStatus.CANCELLED, PaymentState.RETAINED).stream()
                .map(jobRequestMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobRequestResponse> listRefundHistory() {
        return jobRequestRepository.findByPaymentStateOrderByUpdatedAtDesc(PaymentState.REFUNDED).stream()
                .map(jobRequestMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public JobRequestResponse markRefunded(Long jobRequestId) {
        JobRequest job = find(jobRequestId);
        if (job.getStatus() != JobStatus.CANCELLED || job.getPaymentState() != PaymentState.RETAINED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este trabajo no tiene una devolución pendiente");
        }
        job.setPaymentState(PaymentState.REFUNDED);
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
