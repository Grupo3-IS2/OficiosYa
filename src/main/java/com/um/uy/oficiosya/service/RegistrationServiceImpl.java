package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.UserCreateRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService.VerificationResult;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import com.um.uy.oficiosya.service.interfaces.RegistrationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import java.util.Locale;

@Service
@Slf4j
public class RegistrationServiceImpl implements RegistrationService {

    private static final String PENDING_MESSAGE =
            "Si el correo es válido, te enviamos un código de verificación. Ingresalo para crear tu cuenta.";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationService emailVerificationService;
    private final ClientService clientService;
    private final ProfessionalService professionalService;
    private final JwtService jwtService;

    @Value("${app.verification.code-length}")
    private int codeLength;

    @Value("${app.verification.expiration-minutes}")
    private long expirationMinutes;

    @Value("${app.verification.resend-cooldown-seconds}")
    private long resendCooldownSeconds;

    public RegistrationServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder,
                                   EmailVerificationService emailVerificationService,
                                   ClientService clientService, ProfessionalService professionalService,
                                   JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailVerificationService = emailVerificationService;
        this.clientService = clientService;
        this.professionalService = professionalService;
        this.jwtService = jwtService;
    }

    @Override
    public PendingVerificationResponse startRegistration(ClientCreateRequest request) {
        return start(request, Role.CLIENT, null, null);
    }

    @Override
    public PendingVerificationResponse startRegistration(ProfessionalCreateRequest request) {
        return start(request, Role.PROFESSIONAL, request.getPhoneNumber(), request.getWorkingLocation());
    }

    private PendingVerificationResponse start(UserCreateRequest request, Role accountType,
                                              String phoneNumber, String workingLocation) {
        String email = normalize(request.getEmail());

        // Hashed before looking at the email so an existing one doesn't answer any faster.
        String passwordHash = passwordEncoder.encode(request.getPassword());

        if (userRepository.existsByEmailIgnoreCase(email)) {
            log.info("Registration started for an email that already has an account, nothing sent");
            return pendingResponse(email);
        }

        PendingRegistration pending = new PendingRegistration(
                accountType, request.getName(), passwordHash, phoneNumber, workingLocation);

        emailVerificationService.sendCode(email, VerificationPurpose.REGISTER, null, write(pending));
        return pendingResponse(email);
    }

    /**
     * Deliberately not {@code @Transactional}: {@code verifyCode} has to commit on its own,
     * because when a code is rejected it still saves the attempt it just counted, and an
     * enclosing transaction would roll that back together with the exception.
     */
    @Override
    public LoginResponse verifyEmail(VerifyEmailRequest request) {
        String email = normalize(request.getEmail());

        VerificationResult result = emailVerificationService.verifyCode(
                email, VerificationPurpose.REGISTER, request.getCode());

        PendingRegistration pending = read(result.payload());

        // The unique constraint on users.email is the last line of defense if another
        // registration with this email won the race while the code was being entered.
        UserResponse created = switch (pending.accountType()) {
            case CLIENT -> clientService.createClient(
                    ClientCreateRequest.builder().name(pending.name()).email(email).build(),
                    pending.passwordHash());
            case PROFESSIONAL -> professionalService.createProfessional(
                    ProfessionalCreateRequest.builder()
                            .name(pending.name())
                            .email(email)
                            .phoneNumber(pending.phoneNumber())
                            .workingLocation(pending.workingLocation())
                            .build(),
                    pending.passwordHash());
            case ADMIN -> throw new IllegalStateException("An admin cannot register through the public flow");
        };

        User user = userRepository.findByPublicId(created.getId())
                .orElseThrow(() -> new IllegalStateException("The account just created is missing"));

        return new LoginResponse(
                user.getPublicId(),
                jwtService.generateToken(user),
                user.getEmail(),
                user.getName(),
                Role.of(user),
                "Usuario " + user.getEmail() + " registrado correctamente");
    }

    @Override
    public PendingVerificationResponse resendCode(ResendCodeRequest request) {
        String email = normalize(request.getEmail());

        boolean hasAccount = userRepository.existsByEmailIgnoreCase(email);

        if (!hasAccount) {
            emailVerificationService.findPending(email, VerificationPurpose.REGISTER)
                    .ifPresent(pending -> emailVerificationService.sendCode(
                            email, VerificationPurpose.REGISTER, null, pending.payload()));
        }

        return pendingResponse(email);
    }

    private PendingVerificationResponse pendingResponse(String email) {
        return PendingVerificationResponse.builder()
                .email(email)
                .message(PENDING_MESSAGE)
                .codeLength(codeLength)
                .expiresInSeconds(expirationMinutes * 60)
                .resendCooldownSeconds(resendCooldownSeconds)
                .build();
    }

    private String write(PendingRegistration pending) {
        try {
            return JSON.writeValueAsString(pending);
        } catch (JacksonException e) {
            throw new IllegalStateException("Could not serialize the pending registration", e);
        }
    }

    private PendingRegistration read(String payload) {
        if (payload == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No pudimos completar el registro, empezá de nuevo");
        }
        try {
            return JSON.readValue(payload, PendingRegistration.class);
        } catch (JacksonException e) {
            log.error("Unreadable pending registration payload", e);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No pudimos completar el registro, empezá de nuevo");
        }
    }

    private String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
