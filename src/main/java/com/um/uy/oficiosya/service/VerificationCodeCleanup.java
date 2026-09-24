package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.repository.VerificationCodeRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Drops verification codes that expired without being used (an abandoned registration, a
 * code nobody asked to resend). Without it the table only ever grows.
 */
@Component
@Slf4j
public class VerificationCodeCleanup {

    private final VerificationCodeRepository repository;

    public VerificationCodeCleanup(VerificationCodeRepository repository) {
        this.repository = repository;
    }

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT5M")
    @Transactional
    public void purgeExpired() {
        repository.deleteByExpiresAtBefore(LocalDateTime.now(ZoneId.systemDefault()));
        log.debug("Expired verification codes purged");
    }
}
