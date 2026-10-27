package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class EmailSenderServiceImpl implements EmailSenderService {

    private final JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String fromAddress;

    public EmailSenderServiceImpl(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    /**
     * Async: the answer can't wait on the mail server, or how long it takes (or a failure) would
     * tell an address without an account, which gets mailed, from one that has an account and doesn't.
     */
    @Async
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
            // Nobody waits for this answer: the user can ask for the code again
            log.error("Failed to send a verification email to {}", to, e);
        }
    }

    @Override
    public boolean sendNotification(String to, String subject, String body) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(body);

        try {
            mailSender.send(message);
            return true;
        } catch (MailException e) {
            log.error("Failed to send a notification email to {}", to, e);
            return false;
        }
    }

    private String subjectFor(VerificationPurpose purpose) {
        return switch (purpose) {
            case REGISTER -> "Confirmá tu cuenta de OficiosYa";
            case EMAIL_CHANGE -> "Confirmá tu nuevo correo de OficiosYa";
            case PASSWORD_SETUP -> "Creá tu contraseña de OficiosYa";
            case ACCOUNT_DELETION -> "Confirmá que querés eliminar tu cuenta de OficiosYa";
        };
    }

    private String bodyFor(String code, VerificationPurpose purpose) {
        String action = switch (purpose) {
            case REGISTER -> "para activar tu cuenta";
            case EMAIL_CHANGE -> "para confirmar tu nuevo correo";
            case PASSWORD_SETUP -> "para crear la contraseña de tu cuenta";
            case ACCOUNT_DELETION -> "para eliminar tu cuenta (si no lo pediste vos, ignorá este correo)";
        };

        return """
                Tu código de verificación %s es: %s

                Equipo de OficiosYa
                """.formatted(action, code);
    }
}
