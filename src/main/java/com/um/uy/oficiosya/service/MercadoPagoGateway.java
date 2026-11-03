package com.um.uy.oficiosya.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
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
 * Checkout Pro on OficiosYa's own Mercado Pago account, through its REST API (three calls, no SDK).
 * https://www.mercadopago.com.uy/developers/es/reference
 */
@Service
@Slf4j
public class MercadoPagoGateway implements PaymentGateway {

    static final String API_URL = "https://api.mercadopago.com";
    private static final String CURRENCY = "UYU";

    private final RestClient http;
    private final String accessToken;
    private final String webhookSecret;
    private final String siteUrl;
    private final String notificationUrl;

    @Autowired
    public MercadoPagoGateway(@Value("${app.payments.access-token:}") String accessToken,
                              @Value("${app.payments.webhook-secret:}") String webhookSecret,
                              @Value("${app.notifications.site-url}") String siteUrl,
                              @Value("${app.payments.notification-url:}") String notificationUrl) {
        this(RestClient.builder(), accessToken, webhookSecret, siteUrl, notificationUrl);
        if (!isEnabled()) {
            log.warn("app.payments.access-token is not set: payments are disabled. Set MP_ACCESS_TOKEN to enable them.");
        } else if (this.webhookSecret.isEmpty()) {
            log.warn("app.payments.webhook-secret is not set: every Mercado Pago notification will be rejected.");
        }
    }

    MercadoPagoGateway(RestClient.Builder http, String accessToken, String webhookSecret, String siteUrl,
                       String notificationUrl) {
        this.accessToken = accessToken == null ? "" : accessToken.trim();
        this.webhookSecret = webhookSecret == null ? "" : webhookSecret.trim();
        this.siteUrl = siteUrl;
        this.notificationUrl = notificationUrl == null ? "" : notificationUrl.trim();
        this.http = http.baseUrl(API_URL)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + this.accessToken)
                .build();
    }

    @Override
    public boolean isEnabled() {
        return !accessToken.isEmpty();
    }

    @Override
    public String createCheckout(JobRequest jobRequest) {
        requireEnabled();
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
        preference.put("back_urls", Map.of("success", backUrl, "failure", backUrl, "pending", backUrl));
        // shortcut: MP rejects auto_return on a non-https back URL, so locally the client clicks "Volver al sitio"
        if (siteUrl.startsWith("https://")) {
            preference.put("auto_return", "approved");
        }
        // Without it MP notifies the URL set in its panel (Tus integraciones → Webhooks)
        if (!notificationUrl.isEmpty()) {
            preference.put("notification_url", notificationUrl);
        }

        Preference created = call(() -> http.post().uri("/checkout/preferences")
                .body(preference).retrieve().body(Preference.class));
        // Test credentials (TEST-...) only work on the sandbox checkout
        return accessToken.startsWith("TEST-") ? created.sandboxInitPoint() : created.initPoint();
    }

    @Override
    public Payment getPayment(String paymentId) {
        requireEnabled();
        MpPayment payment = call(() -> http.get().uri("/v1/payments/{id}", paymentId)
                .retrieve().body(MpPayment.class));
        return new Payment(String.valueOf(payment.id()), payment.status(), payment.transactionAmount(),
                payment.currencyId(), payment.externalReference());
    }

    @Override
    public void refund(String paymentId, Long jobRequestId) {
        requireEnabled();
        // The same key on a retry makes MP answer with the refund it already made instead of a second one
        call(() -> http.post().uri("/v1/payments/{id}/refunds", paymentId)
                .header("X-Idempotency-Key", "refund-job-" + jobRequestId + "-" + paymentId)
                .body(Map.of()).retrieve().toBodilessEntity());
        log.info("Refunded payment {} of job {}", paymentId, jobRequestId);
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

    private static <T> T call(Supplier<T> request) {
        try {
            return request.get();
        } catch (RestClientException e) {
            log.error("Mercado Pago request failed", e);
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
