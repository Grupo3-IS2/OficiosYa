package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** The calls to Mercado Pago's API (against a mock server) and the webhook signature check. */
class MercadoPagoGatewayTest {

    private static final String SECRET = "webhook-secret";

    private MockRestServiceServer mp;
    private MercadoPagoGateway gateway;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        mp = MockRestServiceServer.bindTo(builder).build();
        gateway = new MercadoPagoGateway(builder, "APP_USR-token", SECRET, "http://localhost:5173", "");
    }

    private static String sign(String manifest, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8)));
    }

    private static JobRequest job() {
        return JobRequest.builder().id(10L).paymentAmount(new BigDecimal("1500.00")).build();
    }

    // --- signature ---

    @Test
    void aNotificationSignedWithTheSecret_isValid() throws Exception {
        String v1 = sign("id:123;request-id:req-1;ts:1700000000;", SECRET);

        assertTrue(gateway.isValidNotification("ts=1700000000,v1=" + v1, "req-1", "123"));
    }

    @Test
    void anAlphanumericDataId_isSignedLowercase() throws Exception {
        String v1 = sign("id:abc123;request-id:req-1;ts:1700000000;", SECRET);

        assertTrue(gateway.isValidNotification("ts=1700000000, v1=" + v1, "req-1", "ABC123"));
    }

    @Test
    void aSignatureForAnotherTimestamp_isInvalid() throws Exception {
        String v1 = sign("id:123;request-id:req-1;ts:1700000000;", SECRET);

        assertFalse(gateway.isValidNotification("ts=1700000001,v1=" + v1, "req-1", "123"));
    }

    @Test
    void aSignatureWithAnotherSecret_isInvalid() throws Exception {
        String v1 = sign("id:123;request-id:req-1;ts:1700000000;", "other-secret");

        assertFalse(gateway.isValidNotification("ts=1700000000,v1=" + v1, "req-1", "123"));
    }

    @Test
    void missingOrGarbledHeaders_areInvalid() {
        assertFalse(gateway.isValidNotification(null, "req-1", "123"));
        assertFalse(gateway.isValidNotification("ts=1700000000", "req-1", "123"));
        assertFalse(gateway.isValidNotification("ts=1700000000,v1=not-hex", "req-1", "123"));
        assertFalse(gateway.isValidNotification("ts=1,v1=00", null, "123"));
    }

    @Test
    void withoutASecret_everyNotificationIsInvalid() throws Exception {
        MercadoPagoGateway noSecret = new MercadoPagoGateway(RestClient.builder(), "APP_USR-token", "", "http://x", "");
        String v1 = sign("id:123;request-id:req-1;ts:1;", SECRET);

        assertFalse(noSecret.isValidNotification("ts=1,v1=" + v1, "req-1", "123"));
    }

    // --- API calls ---

    @Test
    void createCheckout_sendsTheJobsAmountInPesos_andReturnsTheInitPoint() {
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/checkout/preferences"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer APP_USR-token"))
                .andExpect(jsonPath("$.items[0].unit_price").value(1500.00))
                .andExpect(jsonPath("$.items[0].currency_id").value("UYU"))
                .andExpect(jsonPath("$.external_reference").value("10"))
                .andExpect(jsonPath("$.back_urls.success").value("http://localhost:5173/mis-solicitudes?request=10"))
                .andExpect(jsonPath("$.auto_return").doesNotExist())
                .andExpect(jsonPath("$.notification_url").doesNotExist())
                .andRespond(withSuccess("""
                        {"id":"pref-1","init_point":"https://mp/checkout","sandbox_init_point":"https://sandbox/checkout"}""",
                        MediaType.APPLICATION_JSON));

        assertEquals("https://mp/checkout", gateway.createCheckout(job()));
        mp.verify();
    }

    @Test
    void createCheckout_withATestToken_returnsTheSandboxCheckout_andOverHttpsAutoReturns() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MercadoPagoGateway test = new MercadoPagoGateway(builder, "TEST-token", SECRET,
                "https://oficiosya.uy", "https://oficiosya.uy/api/v1/payments/webhook");
        server.expect(requestTo(MercadoPagoGateway.API_URL + "/checkout/preferences"))
                .andExpect(jsonPath("$.auto_return").value("approved"))
                .andExpect(jsonPath("$.notification_url").value("https://oficiosya.uy/api/v1/payments/webhook"))
                .andRespond(withSuccess("""
                        {"init_point":"https://mp/checkout","sandbox_init_point":"https://sandbox/checkout"}""",
                        MediaType.APPLICATION_JSON));

        assertEquals("https://sandbox/checkout", test.createCheckout(job()));
    }

    @Test
    void getPayment_readsWhatMercadoPagoSays() {
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"id":123,"status":"approved","transaction_amount":1500.0,"currency_id":"UYU",
                         "external_reference":"10","payer":{"email":"x@y.com"}}""", MediaType.APPLICATION_JSON));

        PaymentGateway.Payment payment = gateway.getPayment("123");

        assertEquals("123", payment.id());
        assertTrue(payment.isApproved());
        assertEquals(0, new BigDecimal("1500").compareTo(payment.amount()));
        assertEquals("UYU", payment.currency());
        assertEquals("10", payment.externalReference());
    }

    @Test
    void refund_sendsAnIdempotencyKeyPerJobAndPayment() {
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123/refunds"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Idempotency-Key", "refund-job-10-123"))
                .andRespond(withSuccess("{\"id\":1}", MediaType.APPLICATION_JSON));

        gateway.refund("123", 10L);
        mp.verify();
    }

    @Test
    void aFailingMercadoPago_answersBadGateway() {
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123/refunds")).andRespond(withServerError());

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> gateway.refund("123", 10L));
        assertEquals(502, e.getStatusCode().value());
    }

    @Test
    void withoutAToken_paymentsAreOff() {
        MercadoPagoGateway off = new MercadoPagoGateway(RestClient.builder(), "", SECRET, "http://x", "");
        JobRequest job = job();

        assertFalse(off.isEnabled());
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> off.createCheckout(job));
        assertEquals(503, e.getStatusCode().value());
    }
}
