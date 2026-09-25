package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.VerificationCode;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.repository.VerificationCodeRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
@Slf4j
public class EmailVerificationServiceImpl implements EmailVerificationService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    /** Same text whether nothing is pending or the code is just wrong, so it doesn't reveal which. */
    private static final String WRONG_CODE_MESSAGE = "Código incorrecto o vencido";
    private static final String DEFAULT_SECRET = "change-me-in-prod";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final VerificationCodeRepository repository;
    private final EmailSenderService emailSenderService;

    @Value("${app.verification.code-length}")
    private int codeLength;

    @Value("${app.verification.expiration-minutes}")
    private long expirationMinutes;

    @Value("${app.verification.max-attempts}")
    private int maxAttempts;

    @Value("${app.verification.resend-cooldown-seconds}")
    private long resendCooldownSeconds;

    /** Pepper mixed into every hash so a leaked table alone isn't enough to forge codes. */
    @Value("${app.verification.secret}")
    private String secret;

    public EmailVerificationServiceImpl(VerificationCodeRepository repository, EmailSenderService emailSenderService) {
        this.repository = repository;
        this.emailSenderService = emailSenderService;
    }

    @PostConstruct
    void warnIfSecretIsTheDefault() {
        if (secret == null || secret.isBlank() || DEFAULT_SECRET.equals(secret)) {
            log.warn("app.verification.secret is not set: codes are hashed with the public default, set VERIFICATION_SECRET");
        }
    }

    @Override
    public VerificationTerms terms() {
        return new VerificationTerms(codeLength, expirationMinutes * 60, resendCooldownSeconds);
    }

    @Override
    @Transactional
    public void sendCode(String email, VerificationPurpose purpose, UUID userId, String payload) {
        String normalizedEmail = normalize(email);

        repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(normalizedEmail, purpose)
                .ifPresent(previous -> {
                    LocalDateTime cooldownEnds = previous.getLastSentAt().plusSeconds(resendCooldownSeconds);
                    if (cooldownEnds.isAfter(now())) {
                        throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                                "Esperá unos segundos antes de pedir otro código");
                    }
                });

        // Only one pending code per (email, purpose) at a time.
        repository.deleteByEmailIgnoreCaseAndPurpose(normalizedEmail, purpose);

        String code = generateCode();
        String salt = generateSalt();

        VerificationCode verificationCode = VerificationCode.builder()
                .email(normalizedEmail)
                .purpose(purpose)
                .userId(userId)
                .payload(payload)
                .codeHash(hash(code, salt))
                .salt(salt)
                .expiresAt(now().plusMinutes(expirationMinutes))
                .lastSentAt(now())
                .build();

        repository.save(verificationCode);

        emailSenderService.sendVerificationCode(normalizedEmail, code, purpose);
        log.info("Verification code sent to {} for {}", normalizedEmail, purpose);
    }

    /**
     * The rejections below are thrown as exceptions, which would roll the transaction back and
     * undo the attempt counter they just wrote.
     */
    @Override
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public VerificationResult verifyCode(String email, VerificationPurpose purpose, String code) {
        String normalizedEmail = normalize(email);

        VerificationCode verificationCode = repository
                .findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(normalizedEmail, purpose)
                .filter(candidate -> !candidate.isConsumed())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, WRONG_CODE_MESSAGE));

        if (verificationCode.getExpiresAt().isBefore(now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El código expiró, pedí uno nuevo");
        }

        if (verificationCode.getAttempts() >= maxAttempts) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Superaste el número de intentos permitidos, pedí un código nuevo");
        }

        if (!matches(code, verificationCode)) {
            verificationCode.setAttempts(verificationCode.getAttempts() + 1);
            repository.save(verificationCode);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, WRONG_CODE_MESSAGE);
        }

        verificationCode.setConsumed(true);
        repository.save(verificationCode);

        return new VerificationResult(verificationCode.getUserId(), verificationCode.getPayload());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<VerificationResult> findPending(String email, VerificationPurpose purpose) {
        return repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(normalize(email), purpose)
                .filter(candidate -> !candidate.isConsumed())
                .map(candidate -> new VerificationResult(candidate.getUserId(), candidate.getPayload()));
    }

    private boolean matches(String code, VerificationCode verificationCode) {
        byte[] provided = hash(code, verificationCode.getSalt()).getBytes(StandardCharsets.UTF_8);
        byte[] expected = verificationCode.getCodeHash().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(provided, expected);
    }

    private String generateCode() {
        int bound = (int) Math.pow(10, codeLength);
        String digits = Integer.toString(RANDOM.nextInt(bound));
        // Leading zeros are part of the code: 000042 is a valid one.
        return "0".repeat(codeLength - digits.length()).concat(digits);
    }

    /** The server's own zone, said out loud: the stored times and the expiry checks must agree on it. */
    private static LocalDateTime now() {
        return LocalDateTime.now(ZoneId.systemDefault());
    }

    private String generateSalt() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private String hash(String code, String salt) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec((secret + salt).getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] result = mac.doFinal(code.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(result);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Error hashing verification code", e);
        }
    }

    private String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
