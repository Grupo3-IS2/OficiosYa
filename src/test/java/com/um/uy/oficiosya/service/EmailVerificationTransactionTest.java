package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.VerificationCode;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.repository.VerificationCodeRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Runs {@code verifyCode} behind the real transactional proxy (with a mocked transaction
 * manager, so no database is needed) to check how it ends: a rejected code has to
 * <em>commit</em> the attempt it just counted. Rolling back would throw the counter away and
 * let anyone try every code without ever being locked out.
 */
@SpringJUnitConfig(EmailVerificationTransactionTest.Config.class)
@TestPropertySource(properties = {
        "app.verification.code-length=6",
        "app.verification.expiration-minutes=15",
        "app.verification.max-attempts=5",
        "app.verification.resend-cooldown-seconds=60",
        "app.verification.secret=test-secret"
})
class EmailVerificationTransactionTest {

    private static final String EMAIL = "user@example.com";

    @Configuration
    @EnableTransactionManagement
    static class Config {
        @Bean
        VerificationCodeRepository repository() {
            return mock(VerificationCodeRepository.class);
        }

        @Bean
        EmailSenderService emailSenderService() {
            return mock(EmailSenderService.class);
        }

        @Bean
        PlatformTransactionManager transactionManager() {
            return mock(PlatformTransactionManager.class);
        }

        @Bean
        EmailVerificationService emailVerificationService(VerificationCodeRepository repository,
                                                          EmailSenderService emailSenderService) {
            return new EmailVerificationServiceImpl(repository, emailSenderService);
        }
    }

    @Autowired
    private EmailVerificationService service;

    @Autowired
    private VerificationCodeRepository repository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private TransactionStatus status;

    @BeforeEach
    void setUp() {
        reset(repository, transactionManager);
        status = mock(TransactionStatus.class);
        when(transactionManager.getTransaction(any())).thenReturn(status);
    }

    @Test
    void verifyCode_withTheWrongCode_commitsTheAttemptInsteadOfRollingBack() {
        givenAPendingCode(0, LocalDateTime.now().plusMinutes(10));

        assertThrows(ResponseStatusException.class,
                () -> service.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"));

        verify(transactionManager).commit(status);
        verify(transactionManager, never()).rollback(any());
    }

    private void givenAPendingCode(int attempts, LocalDateTime expiresAt) {
        VerificationCode stored = VerificationCode.builder()
                .email(EMAIL)
                .purpose(VerificationPurpose.REGISTER)
                .codeHash("irrelevant")
                .salt("salt")
                .expiresAt(expiresAt)
                .lastSentAt(LocalDateTime.now())
                .attempts(attempts)
                .build();

        when(repository.findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(stored));
    }
}
