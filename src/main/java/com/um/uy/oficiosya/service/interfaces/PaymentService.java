package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.response.JobRequestResponse;

import java.util.List;
import java.util.UUID;

/** Payment lifecycle: PENDING → (client pays) RETAINED → (PIN) PAID, or RETAINED → (cancel) REFUNDED. */
public interface PaymentService {

    /**
     * The checkout URL for the client of an accepted job that isn't paid yet. 403 for anyone else,
     * 400 if there is nothing to pay, 503 if payments are disabled.
     */
    String startPayment(Long jobRequestId, UUID clientId);

    /**
     * What Mercado Pago tells us changed: re-reads the payment and, if approved, holds it on its job.
     * A payment the job can't take (cancelled meanwhile, already paid, wrong amount) is refunded. Safe to repeat.
     * {@code jobRequestId} is the ?job= the checkout put on the notification URL, null without it.
     */
    void handlePaymentNotification(String paymentId, Long jobRequestId);

    /** PAID jobs whose professional wasn't transferred their share yet, oldest first. */
    List<JobRequestResponse> listPendingPayouts();

    /** Transfers already made to professionals, newest first. */
    List<JobRequestResponse> listPayoutHistory();

    /** An admin transferred the professional their share; 400 unless the job waits for that. */
    JobRequestResponse markPaidOut(Long jobRequestId);
}
