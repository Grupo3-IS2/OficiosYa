package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Professional;

import java.math.BigDecimal;

/** The payment provider (Mercado Pago): the client pays OficiosYa, which transfers the professional their share. */
public interface PaymentGateway {

    /** A payment as the provider reports it; {@code externalReference} is the job's id. */
    record Payment(String id, String status, BigDecimal amount, String currency, String externalReference) {
        public boolean isApproved() {
            return "approved".equals(status);
        }

        /** The money went back to the payer, whoever did it: a refund or a chargeback. */
        public boolean isReversed() {
            return "refunded".equals(status) || "charged_back".equals(status);
        }
    }

    /** False when MP_ACCESS_TOKEN is not set: jobs then complete without being paid, as before payments existed. */
    boolean isEnabled();

    /** Whether jobs can be charged for this professional: needed before they accept one. */
    boolean canCollect(Professional professional);

    /** Opens a checkout for the job's amount and returns the URL to send the client to. */
    String createCheckout(JobRequest jobRequest);

    /** Asks the provider for the payment: a notification only says which one changed, never trust its body. */
    Payment getPayment(String paymentId);

    /** Gives the whole payment of the job back to the client; safe to retry. */
    void refund(String paymentId, JobRequest jobRequest);

    /** Whether a webhook notification was really signed by the provider with this app's secret. */
    boolean isValidNotification(String signatureHeader, String requestId, String dataId);
}
