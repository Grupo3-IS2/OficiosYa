package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.VerificationPurpose;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

class EmailSenderServiceImplTest {

    @Mock
    private JavaMailSender mailSender;

    private EmailSenderServiceImpl service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new EmailSenderServiceImpl(mailSender);
        ReflectionTestUtils.setField(service, "fromAddress", "no-reply@oficiosya.com");
    }

    private SimpleMailMessage sent() {
        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        return message.getValue();
    }

    @Test
    void aRegistrationCode_goesToTheAddressWithTheCodeInTheBody() {
        service.sendVerificationCode("ana@example.com", "123456", VerificationPurpose.REGISTER);

        SimpleMailMessage message = sent();
        assertEquals("no-reply@oficiosya.com", message.getFrom());
        assertEquals("ana@example.com", message.getTo()[0]);
        assertEquals("Confirmá tu cuenta de OficiosYa", message.getSubject());
        assertTrue(message.getText().contains("123456"));
        assertTrue(message.getText().contains("activar tu cuenta"));
    }

    @Test
    void anEmailChangeCode_saysItIsForTheNewAddress() {
        service.sendVerificationCode("nueva@example.com", "654321", VerificationPurpose.EMAIL_CHANGE);

        SimpleMailMessage message = sent();
        assertEquals("nueva@example.com", message.getTo()[0]);
        assertEquals("Confirmá tu nuevo correo de OficiosYa", message.getSubject());
        assertTrue(message.getText().contains("654321"));
        assertTrue(message.getText().contains("confirmar tu nuevo correo"));
        assertNotEquals("Confirmá tu cuenta de OficiosYa", message.getSubject());
    }

    @Test
    void whenTheMailServerFails_theAnswerIsA503() {
        doThrow(new MailSendException("smtp down")).when(mailSender).send(any(SimpleMailMessage.class));

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.sendVerificationCode("ana@example.com", "123456", VerificationPurpose.REGISTER));

        assertEquals(503, e.getStatusCode().value());
    }
}
