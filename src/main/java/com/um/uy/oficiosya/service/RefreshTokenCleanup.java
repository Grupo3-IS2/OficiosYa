package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.repository.RefreshTokenRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;

/**
 * Drops refresh tokens that expired. Rotated and revoked ones are kept until then: a rotated
 * token presented again is how a stolen copy is detected.
 */
@Component
@Slf4j
public class RefreshTokenCleanup {

    private final RefreshTokenRepository repository;
    private final Clock clock;

    public RefreshTokenCleanup(RefreshTokenRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT5M")
    @Transactional
    public void purgeExpired() {
        repository.deleteByExpiresAtBefore(OffsetDateTime.now(clock));
        log.debug("Expired refresh tokens purged");
    }
}
