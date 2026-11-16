package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.exception.GlobalExceptionHandler;
import com.um.uy.oficiosya.service.interfaces.PaymentGateway;
import com.um.uy.oficiosya.service.interfaces.PaymentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The webhook only acts on notifications Mercado Pago signed, and only on payments. */
class PaymentControllerTest {

    private static final String WEBHOOK = "/api/v1/payments/webhook";

    @Mock
    private PaymentService paymentService;
    @Mock
    private PaymentGateway paymentGateway;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mvc = MockMvcBuilders.standaloneSetup(new PaymentController(paymentService, paymentGateway))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void aSignedPaymentNotification_isHandled() throws Exception {
        when(paymentGateway.isValidNotification("ts=1,v1=ab", "req-1", "123")).thenReturn(true);

        mvc.perform(post(WEBHOOK).param("type", "payment").param("data.id", "123").param("job", "10")
                        .header("x-signature", "ts=1,v1=ab").header("x-request-id", "req-1"))
                .andExpect(status().isOk());

        verify(paymentService).handlePaymentNotification("123", 10L);
    }

    @Test
    void anUnsignedNotification_is401() throws Exception {
        mvc.perform(post(WEBHOOK).param("type", "payment").param("data.id", "123"))
                .andExpect(status().isUnauthorized());

        verify(paymentService, never()).handlePaymentNotification(any(), any());
    }

    @Test
    void anotherKindOfNotification_isAcknowledgedAndIgnored() throws Exception {
        when(paymentGateway.isValidNotification("ts=1,v1=ab", "req-1", "55")).thenReturn(true);

        mvc.perform(post(WEBHOOK).param("type", "merchant_order").param("data.id", "55")
                        .header("x-signature", "ts=1,v1=ab").header("x-request-id", "req-1"))
                .andExpect(status().isOk());

        verify(paymentService, never()).handlePaymentNotification(any(), any());
    }
}
