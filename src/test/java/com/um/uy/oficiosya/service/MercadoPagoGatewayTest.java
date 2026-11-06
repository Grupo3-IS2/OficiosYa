package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** The calls to Mercado Pago's API (against a mock server) and the webhook signature check. */
class MercadoPagoGatewayTest {

    private static final String SECRET = "webhook-secret";
    private static final BigDecimal COMMISSION = new BigDecimal("15");
    /** The linked professional's OAuth access token. */
    private static final String SELLER = "seller-token";
    private static final String PLATFORM = "platform-token";

    private final MercadoPagoAccountLink accountLink = mock(MercadoPagoAccountLink.class);

    private MockRestServiceServer mp;
    private MercadoPagoGateway gateway;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        mp = MockRestServiceServer.bindTo(builder).build();
        gateway = new MercadoPagoGateway(builder, "APP_USR-token", SECRET, "http://localhost:5173", "", COMMISSION, accountLink);
    }

    private static String sign(String manifest, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8)));
    }

    private static JobRequest job() {
        return JobRequest.builder().id(10L).paymentAmount(new BigDecimal("1500.00"))
                .professional(Professional.builder().name("Beto").build()).build();
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
        MercadoPagoGateway noSecret = new MercadoPagoGateway(RestClient.builder(), "APP_USR-token", "", "http://x", "", COMMISSION, accountLink);
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
                .andExpect(jsonPath("$.marketplace_fee").doesNotExist())
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
                "https://oficiosya.uy", "", COMMISSION, accountLink);
        server.expect(requestTo(MercadoPagoGateway.API_URL + "/checkout/preferences"))
                .andExpect(jsonPath("$.auto_return").value("approved"))
                .andExpect(jsonPath("$.notification_url").value("https://oficiosya.uy/api/v1/payments/webhook?job=10"))
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

        PaymentGateway.Payment payment = gateway.getPayment("123", null);

        assertEquals("123", payment.id());
        assertTrue(payment.isApproved());
        assertEquals(0, new BigDecimal("1500").compareTo(payment.amount()));
        assertEquals("UYU", payment.currency());
        assertEquals("10", payment.externalReference());
    }

    private void paymentIs(String status) {
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"id\":123,\"status\":\"" + status + "\"}", MediaType.APPLICATION_JSON));
    }

    @Test
    void refund_sendsAnIdempotencyKeyPerJobAndPayment() {
        paymentIs("approved");
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123/refunds"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Idempotency-Key", "refund-job-10-123"))
                .andRespond(withSuccess("{\"id\":1}", MediaType.APPLICATION_JSON));

        gateway.refund("123", job());
        mp.verify();
    }

    @Test
    void refund_ofAPaymentAlreadyRefundedFromThePanel_doesNothing() {
        paymentIs("refunded");

        gateway.refund("123", job());
        mp.verify();
    }

    @Test
    void aFailingMercadoPago_answersBadGateway() {
        paymentIs("approved");
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123/refunds")).andRespond(withServerError());

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> gateway.refund("123", job()));
        assertEquals(502, e.getStatusCode().value());
    }

    @Test
    void aRefundMercadoPagoRefuses_answersBadGateway() {
        paymentIs("approved");
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123/refunds")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> gateway.refund("123", job()));
        assertEquals(502, e.getStatusCode().value());
    }

    // --- split payments, into the professional's linked account ---

    /** A job charged into the account the professional still has linked. */
    private static JobRequest splitJob() {
        JobRequest job = job();
        job.getProfessional().setPayoutMpUserId("987");
        job.setMpCollectorUserId("987");
        return job;
    }

    /** With OficiosYa's own token being PLATFORM, to tell which of the two a request used. */
    private MercadoPagoGateway platformGateway() {
        RestClient.Builder builder = RestClient.builder();
        mp = MockRestServiceServer.bindTo(builder).build();
        return new MercadoPagoGateway(builder, PLATFORM, SECRET, "http://localhost:5173", "", COMMISSION, accountLink);
    }

    @Test
    void createCheckout_forALinkedProfessional_chargesIntoTheirAccount_withTheCommissionAsMarketplaceFee() {
        JobRequest job = job();
        job.getProfessional().setPayoutMpUserId("987");
        when(accountLink.accessToken(job.getProfessional())).thenReturn(SELLER);
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/checkout/preferences"))
                .andExpect(header("Authorization", "Bearer " + SELLER))
                .andExpect(jsonPath("$.marketplace_fee").value(225.00))
                .andRespond(withSuccess("{\"init_point\":\"https://mp/checkout\"}", MediaType.APPLICATION_JSON));

        assertEquals("https://mp/checkout", gateway.createCheckout(job));
        mp.verify();
        assertEquals("987", job.getMpCollectorUserId());
    }

    @Test
    void createCheckout_withoutALinkedAccount_isCollectedByOficiosYa() {
        JobRequest job = splitJob(); // from a checkout opened before the link was lost
        MercadoPagoGateway platform = platformGateway();
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/checkout/preferences"))
                .andExpect(header("Authorization", "Bearer " + PLATFORM))
                .andRespond(withSuccess("{\"init_point\":\"https://mp/checkout\"}", MediaType.APPLICATION_JSON));

        platform.createCheckout(job);

        assertNull(job.getMpCollectorUserId());
    }

    @Test
    void aPaymentCollectedByOficiosYa_isReadWithItsToken_evenIfTheProfessionalLinkedSince() {
        JobRequest job = job();
        job.getProfessional().setPayoutMpUserId("987");
        MercadoPagoGateway platform = platformGateway();
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123"))
                .andExpect(header("Authorization", "Bearer " + PLATFORM))
                .andRespond(withSuccess("{\"id\":123,\"status\":\"approved\"}", MediaType.APPLICATION_JSON));

        platform.getPayment("123", job);
        mp.verify();
    }

    @Test
    void aPaymentInAnAccountNoLongerLinked_isNeverTriedWithAnotherToken() {
        JobRequest job = splitJob();
        job.getProfessional().setPayoutMpUserId("111");

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> gateway.refund("123", job));
        assertEquals(502, e.getStatusCode().value());
        assertTrue(e.getReason().contains("volver a vincular"));
        mp.verify();
    }

    @Test
    void aSplitPaymentAfterLinkingWasTurnedOff_isNeverTriedWithoutAToken() {
        JobRequest job = splitJob();

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> gateway.getPayment("123", job));
        assertEquals(502, e.getStatusCode().value());
        mp.verify();
    }

    @Test
    void aRevokedToken_saysToLinkAgain() {
        JobRequest job = splitJob();
        when(accountLink.accessToken(job.getProfessional())).thenReturn(SELLER);
        when(accountLink.unlinkIfRevoked(job.getProfessional())).thenReturn(true);
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> gateway.getPayment("123", job));
        assertTrue(e.getReason().contains("volver a vincular"));
    }

    @Test
    void a401ThatIsntAboutTheToken_isAnOrdinaryFailure() {
        JobRequest job = splitJob();
        when(accountLink.accessToken(job.getProfessional())).thenReturn(SELLER);
        when(accountLink.unlinkIfRevoked(job.getProfessional())).thenReturn(false);
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> gateway.getPayment("123", job));
        assertFalse(e.getReason().contains("volver a vincular"));
    }

    @Test
    void refund_ofASplitPayment_usesTheProfessionalsToken() {
        JobRequest job = splitJob();
        when(accountLink.accessToken(job.getProfessional())).thenReturn(SELLER);
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123"))
                .andExpect(header("Authorization", "Bearer " + SELLER))
                .andRespond(withSuccess("{\"id\":123,\"status\":\"approved\"}", MediaType.APPLICATION_JSON));
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/v1/payments/123/refunds"))
                .andExpect(header("Authorization", "Bearer " + SELLER))
                .andRespond(withSuccess("{\"id\":1}", MediaType.APPLICATION_JSON));

        gateway.refund("123", job);
        mp.verify();
    }

    @Test
    void withLinkingOn_onlyALinkedProfessionalCanCollect() {
        Professional professional = Professional.builder().payoutAccount("BROU 001234567-00001").build();
        when(accountLink.isEnabled()).thenReturn(true);
        assertFalse(gateway.canCollect(professional));

        professional.setMpAccessToken("encrypted");
        assertTrue(gateway.canCollect(professional));

        when(accountLink.isEnabled()).thenReturn(false);
        professional.setMpAccessToken(null);
        assertTrue(gateway.canCollect(professional));
    }

    @Test
    void withoutAToken_paymentsAreOff() {
        MercadoPagoGateway off = new MercadoPagoGateway(RestClient.builder(), "", SECRET, "http://x", "", COMMISSION, accountLink);
        JobRequest job = job();

        assertFalse(off.isEnabled());
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> off.createCheckout(job));
        assertEquals(503, e.getStatusCode().value());
    }
}
