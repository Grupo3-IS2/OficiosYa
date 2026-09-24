package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.VerificationCode;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.repository.VerificationCodeRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService.VerificationResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmailVerificationServiceImplTest {

    @Mock
    private VerificationCodeRepository repository;

    @Mock
    private EmailSenderService emailSenderService;

    private EmailVerificationServiceImpl service;

    private static final String EMAIL = "user@example.com";
    private static final UUID USER_ID = UUID.randomUUID();
    private static final String PAYLOAD = "{\"name\":\"Ana Perez\",\"passwordHash\":\"{argon2}hash\"}";

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new EmailVerificationServiceImpl(repository, emailSenderService);
        ReflectionTestUtils.setField(service, "codeLength", 6);
        ReflectionTestUtils.setField(service, "expirationMinutes", 15L);
        ReflectionTestUtils.setField(service, "maxAttempts", 5);
        ReflectionTestUtils.setField(service, "resendCooldownSeconds", 60L);
        ReflectionTestUtils.setField(service, "secret", "test-secret");
    }

    @Test
    void sendCode_storesAHashNotThePlainCode() {
        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.empty());

        service.sendCode(EMAIL, VerificationPurpose.REGISTER, USER_ID, PAYLOAD);

        ArgumentCaptor<VerificationCode> savedCaptor = ArgumentCaptor.forClass(VerificationCode.class);
        verify(repository).save(savedCaptor.capture());
        verify(repository).deleteByEmailIgnoreCaseAndPurpose(EMAIL, VerificationPurpose.REGISTER);

        ArgumentCaptor<String> codeCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailSenderService).sendVerificationCode(eq(EMAIL), codeCaptor.capture(), eq(VerificationPurpose.REGISTER));

        VerificationCode saved = savedCaptor.getValue();
        assertEquals(USER_ID, saved.getUserId());
        assertEquals(PAYLOAD, saved.getPayload());
        assertNotEquals(codeCaptor.getValue(), saved.getCodeHash());
    }

    @Test
    void sendCode_beforeTheCooldownElapsed_isRejected() {
        VerificationCode recent = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .userId(USER_ID)
                .lastSentAt(LocalDateTime.now())
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(recent));

        assertThrows(ResponseStatusException.class,
                () -> service.sendCode(EMAIL, VerificationPurpose.REGISTER, USER_ID, PAYLOAD));

        verify(repository, times(0)).save(any());
    }

    @Test
    void sendCode_forARegistration_needsNoUserYet() {
        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.empty());

        service.sendCode(EMAIL, VerificationPurpose.REGISTER, null, PAYLOAD);

        ArgumentCaptor<VerificationCode> savedCaptor = ArgumentCaptor.forClass(VerificationCode.class);
        verify(repository).save(savedCaptor.capture());
        assertNull(savedCaptor.getValue().getUserId());
        assertEquals(PAYLOAD, savedCaptor.getValue().getPayload());
    }

    @Test
    void verifyCode_withTheRightCode_consumesItAndReturnsWhatItWasIssuedFor() {
        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.empty());

        service.sendCode(EMAIL, VerificationPurpose.REGISTER, USER_ID, PAYLOAD);

        ArgumentCaptor<VerificationCode> savedCaptor = ArgumentCaptor.forClass(VerificationCode.class);
        verify(repository).save(savedCaptor.capture());
        VerificationCode stored = savedCaptor.getValue();

        ArgumentCaptor<String> codeCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailSenderService).sendVerificationCode(eq(EMAIL), codeCaptor.capture(), any());
        String plainCode = codeCaptor.getValue();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(stored));

        VerificationResult result = service.verifyCode(EMAIL, VerificationPurpose.REGISTER, plainCode);

        assertEquals(USER_ID, result.userId());
        assertEquals(PAYLOAD, result.payload());
        assertEquals(true, stored.isConsumed());
    }

    @Test
    void verifyCode_withTheWrongCode_incrementsAttemptsAndFails() {
        VerificationCode stored = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .userId(USER_ID)
                .codeHash("irrelevant")
                .salt("salt")
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .lastSentAt(LocalDateTime.now())
                .attempts(0)
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(stored));

        assertThrows(ResponseStatusException.class,
                () -> service.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"));

        assertEquals(1, stored.getAttempts());
        verify(repository).save(stored);
    }

    @Test
    void verifyCode_expired_isRejectedButKeptSoItCanBeResent() {
        VerificationCode stored = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .userId(USER_ID)
                .codeHash("irrelevant")
                .salt("salt")
                .expiresAt(LocalDateTime.now().minusMinutes(1))
                .lastSentAt(LocalDateTime.now().minusMinutes(20))
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(stored));

        assertThrows(ResponseStatusException.class,
                () -> service.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"));

        verify(repository, never()).delete(any(VerificationCode.class));
    }

    @Test
    void verifyCode_afterTooManyAttempts_isRejectedAndKeepsRejecting() {
        VerificationCode stored = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .userId(USER_ID)
                .codeHash("irrelevant")
                .salt("salt")
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .lastSentAt(LocalDateTime.now())
                .attempts(5)
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(stored));

        assertThrows(ResponseStatusException.class,
                () -> service.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"));

        verify(repository, never()).delete(any(VerificationCode.class));
        assertEquals(5, stored.getAttempts());
    }

    @Test
    void verifyCode_withNoPendingCode_saysTheSameAsAWrongCode() {
        VerificationCode stored = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .codeHash("irrelevant")
                .salt("salt")
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .lastSentAt(LocalDateTime.now())
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.empty());
        ResponseStatusException none = assertThrows(ResponseStatusException.class,
                () -> service.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"));

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(stored));
        ResponseStatusException wrong = assertThrows(ResponseStatusException.class,
                () -> service.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"));

        assertEquals(wrong.getReason(), none.getReason());
    }

    @Test
    void findPending_returnsTheUnusedCodeEvenIfItExpired() {
        VerificationCode expired = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .payload(PAYLOAD)
                .expiresAt(LocalDateTime.now().minusMinutes(1))
                .lastSentAt(LocalDateTime.now().minusMinutes(20))
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(expired));

        Optional<VerificationResult> pending = service.findPending(EMAIL, VerificationPurpose.REGISTER);

        assertEquals(PAYLOAD, pending.orElseThrow().payload());
    }

    @Test
    void findPending_ignoresAConsumedCode() {
        VerificationCode used = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .payload(PAYLOAD)
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .lastSentAt(LocalDateTime.now())
                .consumed(true)
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(used));

        assertTrue(service.findPending(EMAIL, VerificationPurpose.REGISTER).isEmpty());
    }

    @Test
    void verifyCode_withNoPendingCode_isRejected() {
        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class,
                () -> service.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"));
    }

    @Test
    void verifyCode_alreadyConsumed_isTreatedAsNoPendingCode() {
        VerificationCode stored = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .userId(USER_ID)
                .codeHash("irrelevant")
                .salt("salt")
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .lastSentAt(LocalDateTime.now())
                .consumed(true)
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(stored));

        assertThrows(ResponseStatusException.class,
                () -> service.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"));
    }
}
