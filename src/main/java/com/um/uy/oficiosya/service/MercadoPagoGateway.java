package com.um.uy.oficiosya.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Checkout Pro through Mercado Pago's REST API (no SDK). A job whose professional linked their account (OAuth) is
 * charged into it with their token, OficiosYa's commission going to MP_ACCESS_TOKEN's account as marketplace_fee;
 * otherwise OficiosYa's own account collects it all and an admin transfers the professional their share.
 * https://www.mercadopago.com.uy/developers/es/reference
 */
@Service
@Slf4j
public class MercadoPagoGateway implements PaymentGateway {

    static final String API_URL = "https://api.mercadopago.com";
    private static final String CURRENCY = "UYU";
    private static final String RELINK = MercadoPagoAccountLink.RELINK;

    private final RestClient http;
    private final MercadoPagoAccountLink accountLink;
    private final BigDecimal commissionPercent;
    private final String accessToken;
    private final String webhookSecret;
    private final String siteUrl;
    private final String notificationUrl;

    @Autowired
    public MercadoPagoGateway(@Value("${app.payments.access-token:}") String accessToken,
                              @Value("${app.payments.webhook-secret:}") String webhookSecret,
                              @Value("${app.notifications.site-url}") String siteUrl,
                              @Value("${app.payments.notification-url:}") String notificationUrl,
                              @Value("${app.payments.commission-percent}") BigDecimal commissionPercent,
                              MercadoPagoAccountLink accountLink) {
        this(RestClient.builder(), accessToken, webhookSecret, siteUrl, notificationUrl, commissionPercent, accountLink);
        if (!isEnabled()) {
            log.warn("app.payments.access-token is not set: payments are disabled. Set MP_ACCESS_TOKEN to enable them.");
        } else if (this.webhookSecret.isEmpty()) {
            log.warn("app.payments.webhook-secret is not set: every Mercado Pago notification will be rejected.");
        }
    }

    MercadoPagoGateway(RestClient.Builder http, String accessToken, String webhookSecret, String siteUrl,
                       String notificationUrl, BigDecimal commissionPercent, MercadoPagoAccountLink accountLink) {
        this.accountLink = accountLink;
        this.commissionPercent = commissionPercent;
        this.accessToken = accessToken == null ? "" : accessToken.trim();
        this.webhookSecret = webhookSecret == null ? "" : webhookSecret.trim();
        this.siteUrl = siteUrl;
        String notifyAt = notificationUrl == null ? "" : notificationUrl.trim();
        // Split payments need ?job= on it (see tokenFor), so it is always sent when the site has a public https URL
        this.notificationUrl = notifyAt.isEmpty() && siteUrl.startsWith("https://")
                ? siteUrl + "/api/v1/payments/webhook" : notifyAt;
        this.http = http.baseUrl(API_URL).build();
    }

    @Override
    public boolean isEnabled() {
        return !accessToken.isEmpty();
    }

    @Override
    public boolean canCollect(Professional professional) {
        // With linking on, jobs are charged into the professional's own account: they must have linked it
        if (accountLink.isEnabled()) return professional.getMpAccessToken() != null;
        return professional.getPayoutAccount() != null && !professional.getPayoutAccount().isBlank();
    }

    @Override
    public String createCheckout(JobRequest jobRequest) {
        requireEnabled();
        Professional professional = jobRequest.getProfessional();
        String sellerToken = accountLink.accessToken(professional);
        String token = sellerToken == null ? accessToken : sellerToken;
        // The requests page opens the job linked with ?request=
        String backUrl = siteUrl + "/mis-solicitudes?request=" + jobRequest.getId();

        Map<String, Object> preference = new HashMap<>();
        preference.put("items", List.of(Map.of(
                "id", "job-" + jobRequest.getId(),
                "title", "Trabajo #" + jobRequest.getId() + " en OficiosYa",
                "quantity", 1,
                "unit_price", jobRequest.getPaymentAmount(),
                "currency_id", CURRENCY)));
        preference.put("external_reference", jobRequest.getId().toString());
        if (sellerToken != null) {
            preference.put("marketplace_fee", jobRequest.getPaymentAmount().multiply(commissionPercent)
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
        }
        preference.put("back_urls", Map.of("success", backUrl, "failure", backUrl, "pending", backUrl));
        // shortcut: MP rejects auto_return on a non-https back URL, so locally the client clicks "Volver al sitio"
        if (siteUrl.startsWith("https://")) {
            preference.put("auto_return", "approved");
        }
        // Without it MP notifies the URL set in its panel (Tus integraciones → Webhooks)
        // ?job= says whose account the payment is in, to read it with their token (MP keeps the query, adds data.id)
        if (!notificationUrl.isEmpty()) {
            preference.put("notification_url", notificationUrl + (notificationUrl.contains("?") ? "&" : "?")
                    + "job=" + jobRequest.getId());
        }

        Preference created = call(sellerToken == null ? null : professional, () -> http.post().uri("/checkout/preferences")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .body(preference).retrieve().body(Preference.class));
        // shortcut: only the latest checkout is remembered, so paying an older one opened on another account
        // (OficiosYa's, before the professional linked theirs) can't be read; keep one per preference if it happens
        jobRequest.setMpCollectorUserId(sellerToken == null ? null : professional.getPayoutMpUserId());
        // Test credentials (TEST-...) only work on the sandbox checkout
        return token.startsWith("TEST-") ? created.sandboxInitPoint() : created.initPoint();
    }

    @Override
    public Payment getPayment(String paymentId, JobRequest jobRequest) {
        requireEnabled();
        String token = tokenFor(jobRequest);
        MpPayment payment = call(seller(jobRequest), () -> http.get().uri("/v1/payments/{id}", paymentId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve().body(MpPayment.class));
        return new Payment(String.valueOf(payment.id()), payment.status(), payment.transactionAmount(),
                payment.currencyId(), payment.externalReference());
    }

    @Override
    public void refund(String paymentId, JobRequest jobRequest) {
        // Already refunded from Mercado Pago's panel (their API refuses refunds for test sellers): nothing left to do
        if ("refunded".equals(getPayment(paymentId, jobRequest).status())) {
            log.info("Payment {} of job {} was already refunded", paymentId, jobRequest.getId());
            return;
        }
        // A split payment is refunded whole, marketplace_fee included, from the professional's account
        String token = tokenFor(jobRequest);
        // The same key on a retry makes MP answer with the refund it already made instead of a second one
        call(seller(jobRequest), () -> http.post().uri("/v1/payments/{id}/refunds", paymentId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header("X-Idempotency-Key", "refund-job-" + jobRequest.getId() + "-" + paymentId)
                .body(Map.of()).retrieve().toBodilessEntity());
        log.info("Refunded payment {} of job {}", paymentId, jobRequest.getId());
    }

    /**
     * A payment is in the account of the token that created it, which the job remembers. 502 if the professional
     * no longer has that account linked: only that account's token can read or refund the payment.
     */
    private String tokenFor(JobRequest jobRequest) {
        Professional seller = seller(jobRequest);
        if (seller == null) return accessToken;
        if (!jobRequest.getMpCollectorUserId().equals(seller.getPayoutMpUserId())) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, RELINK);
        }
        String sellerToken = accountLink.accessToken(seller);
        if (sellerToken == null) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, RELINK);
        return sellerToken;
    }

    /** The professional whose account the job's payment is in; null if it is OficiosYa's. */
    private static Professional seller(JobRequest jobRequest) {
        return jobRequest == null || jobRequest.getMpCollectorUserId() == null ? null : jobRequest.getProfessional();
    }

    /**
     * x-signature is "ts=...,v1=...": v1 is the HMAC-SHA256, with the webhook secret, of
     * "id:{data.id};request-id:{x-request-id};ts:{ts};".
     * shortcut: ts isn't checked for age; a replayed notification only makes us re-read the payment from MP.
     */
    @Override
    public boolean isValidNotification(String signatureHeader, String requestId, String dataId) {
        if (webhookSecret.isEmpty() || signatureHeader == null || requestId == null || dataId == null) return false;

        String ts = null;
        String v1 = null;
        for (String part : signatureHeader.split(",")) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length != 2) continue;
            if (pair[0].equals("ts")) ts = pair[1];
            else if (pair[0].equals("v1")) v1 = pair[1];
        }
        if (ts == null || v1 == null) return false;

        String manifest = "id:" + dataId.toLowerCase(Locale.ROOT) + ";request-id:" + requestId + ";ts:" + ts + ";";
        try {
            return MessageDigest.isEqual(hmac(manifest), HexFormat.of().parseHex(v1));
        } catch (IllegalArgumentException _) {
            return false;
        }
    }

    private byte[] hmac(String text) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(text.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 is not available", e);
        }
    }

    private void requireEnabled() {
        if (!isEnabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Los pagos no están disponibles por el momento");
        }
    }

    /** {@code seller}: the professional whose token the request uses, if any; a 401 may mean they revoked it. */
    private <T> T call(Professional seller, Supplier<T> request) {
        try {
            return request.get();
        } catch (RestClientException e) {
            log.error("Mercado Pago request failed", e);
            if (seller != null && e instanceof HttpClientErrorException.Unauthorized && accountLink.unlinkIfRevoked(seller)) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, RELINK);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No pudimos conectarnos con Mercado Pago, intentá de nuevo en unos minutos");
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Preference(@JsonProperty("init_point") String initPoint,
                      @JsonProperty("sandbox_init_point") String sandboxInitPoint) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record MpPayment(Long id,
                     String status,
                     @JsonProperty("transaction_amount") BigDecimal transactionAmount,
                     @JsonProperty("currency_id") String currencyId,
                     @JsonProperty("external_reference") String externalReference) {
    }
}
