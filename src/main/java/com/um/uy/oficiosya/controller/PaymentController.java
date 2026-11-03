package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.dto.response.PaymentCheckoutResponse;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import com.um.uy.oficiosya.service.interfaces.PaymentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Paying a job with Mercado Pago. The client pays once the job is accepted; Mercado Pago tells the webhook,
 * the job's paymentState becomes RETAINED, and the PIN later releases it (PAID) or a cancel refunds it.
 */
@RestController
public class PaymentController {

    private final PaymentService paymentService;
    private final PaymentGateway paymentGateway;

    public PaymentController(PaymentService paymentService, PaymentGateway paymentGateway) {
        this.paymentService = paymentService;
        this.paymentGateway = paymentGateway;
    }

    /**
     * The client of an accepted, unpaid job gets the Mercado Pago checkout to send the browser to. Coming back,
     * it lands on /mis-solicitudes?request={id}: read the job again, its paymentState is the only truth.
     */
    @PreAuthorize("hasRole('CLIENT')")
    @PostMapping("/api/v1/job-requests/{id}/payment")
    public ResponseEntity<PaymentCheckoutResponse> startPayment(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(new PaymentCheckoutResponse(
                paymentService.startPayment(id, AuthenticatedUser.id(authentication))));
    }

    /**
     * Mercado Pago's notifications (public). 401 unless signed with MP_WEBHOOK_SECRET; anything else MP
     * notifies but a payment is acknowledged and ignored. An error answers 5xx so MP retries it.
     */
    @PostMapping("/api/v1/payments/webhook")
    public ResponseEntity<Void> webhook(@RequestParam(name = "type", required = false) String type,
                                        @RequestParam(name = "data.id", required = false) String dataId,
                                        @RequestHeader(name = "x-signature", required = false) String signature,
                                        @RequestHeader(name = "x-request-id", required = false) String requestId) {
        if (!paymentGateway.isValidNotification(signature, requestId, dataId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if ("payment".equals(type)) {
            paymentService.handlePaymentNotification(dataId);
        }
        return ResponseEntity.ok().build();
    }

    /** Completed jobs whose professional still has to be transferred paymentAmount - platformFee. */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/api/v1/admin/payouts")
    public ResponseEntity<List<JobRequestResponse>> listPendingPayouts() {
        return ResponseEntity.ok(paymentService.listPendingPayouts());
    }

    /** The admin made that transfer, from Mercado Pago, by hand. */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/api/v1/admin/payouts/{id}")
    public ResponseEntity<JobRequestResponse> markPaidOut(@PathVariable Long id) {
        return ResponseEntity.ok(paymentService.markPaidOut(id));
    }
}
