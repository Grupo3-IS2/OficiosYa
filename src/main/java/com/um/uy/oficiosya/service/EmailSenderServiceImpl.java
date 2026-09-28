package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@Slf4j
public class EmailSenderServiceImpl implements EmailSenderService {

    private final JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String fromAddress;

    public EmailSenderServiceImpl(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @Override
    public void sendVerificationCode(String to, String code, VerificationPurpose purpose) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(to);
        message.setSubject(subjectFor(purpose));
        message.setText(bodyFor(code, purpose));

        try {
            mailSender.send(message);
        } catch (MailException e) {
            log.error("Failed to send a verification email to {}", to, e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "No pudimos enviar el correo de verificación, intentá de nuevo en unos minutos");
        }
    }

    private String subjectFor(VerificationPurpose purpose) {
        return switch (purpose) {
            case REGISTER -> "Confirmá tu cuenta de OficiosYa";
            case EMAIL_CHANGE -> "Confirmá tu nuevo correo de OficiosYa";
        };
    }

    private String bodyFor(String code, VerificationPurpose purpose) {
        String action = purpose == VerificationPurpose.REGISTER
                ? "para activar tu cuenta"
                : "para confirmar tu nuevo correo";

        return """
                Tu código de verificación %s es: %s

                Equipo de OficiosYa
                """.formatted(action, code);
    }
}
