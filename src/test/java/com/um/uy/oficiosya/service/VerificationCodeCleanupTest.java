package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.repository.VerificationCodeRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class VerificationCodeCleanupTest {

    @Test
    void purgeExpired_dropsTheCodesThatExpiredUntilNow() {
        VerificationCodeRepository repository = mock(VerificationCodeRepository.class);

        new VerificationCodeCleanup(repository).purgeExpired();

        ArgumentCaptor<OffsetDateTime> cutoff = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(repository).deleteByExpiresAtBefore(cutoff.capture());
        Instant cutoffInstant = cutoff.getValue().toInstant();
        assertTrue(Duration.between(cutoffInstant, Instant.now()).abs().getSeconds() < 5,
                "the cutoff is the current time, so only what already expired goes");
    }
}
