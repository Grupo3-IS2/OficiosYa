package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.RefreshToken;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.RefreshTokenRepository;
import com.um.uy.oficiosya.service.interfaces.RefreshTokenService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

@Service
@Slf4j
public class RefreshTokenServiceImpl implements RefreshTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private static final int TOKEN_BYTES = 32;

    /**
     * Two tabs whose access token expires at the same moment both try to exchange the same
     * refresh token. The second one, within this window, just loses (401) instead of being taken
     * for a stolen copy: it picks up the token the first tab stored.
     */
    static final Duration ROTATION_GRACE = Duration.ofSeconds(30);

    private static final String SESSION_EXPIRED = "La sesión expiró, iniciá sesión nuevamente";

    private final RefreshTokenRepository refreshTokenRepository;
    private final ClientRepository clientRepository;
    private final Clock clock;
    /** How long a login lasts without being used; every exchange starts it over. */
    private final Duration lifetime;

    public RefreshTokenServiceImpl(RefreshTokenRepository refreshTokenRepository,
                                   ClientRepository clientRepository,
                                   Clock clock,
                                   @Value("${security.refresh-token.expiration-days}") long lifetimeDays) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.clientRepository = clientRepository;
        this.clock = clock;
        this.lifetime = Duration.ofDays(lifetimeDays);
    }

    @Override
    @Transactional
    public String issue(UUID userId) {
        Client user = clientRepository.findByPublicId(userId)
                .orElseThrow(() -> new IllegalStateException("Cannot start a session for a user that doesn't exist"));
        return this.create(user, UUID.randomUUID());
    }

    @Override
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public Rotation rotate(String refreshToken) {
        RefreshToken current = this.find(refreshToken).orElseThrow(RefreshTokenServiceImpl::expired);
        OffsetDateTime now = OffsetDateTime.now(clock);

        if (current.getRevokedAt() != null || !current.getExpiresAt().isAfter(now)) {
            throw expired();
        }

        if (current.getRotatedAt() != null) {
            if (current.getRotatedAt().isBefore(now.minus(ROTATION_GRACE))) {
                // Only the one who got the next token should have it now: someone kept a copy
                log.warn("Refresh token reused after rotation, revoking its whole family");
                refreshTokenRepository.revokeFamily(current.getFamily(), now);
            }
            throw expired();
        }

        current.setRotatedAt(now);
        String next = this.create(current.getUser(), current.getFamily());
        return new Rotation(current.getUser().getPublicId(), next);
    }

    @Override
    @Transactional
    public Optional<UUID> ownerOf(String refreshToken) {
        return this.find(refreshToken).map(token -> token.getUser().getPublicId());
    }

    @Override
    @Transactional
    public void revokeAll(UUID userId) {
        refreshTokenRepository.revokeAllOf(userId, OffsetDateTime.now(clock));
    }

    private String create(Client user, UUID family) {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        refreshTokenRepository.save(RefreshToken.builder()
                .user(user)
                .tokenHash(hash(token))
                .family(family)
                .expiresAt(OffsetDateTime.now(clock).plus(lifetime))
                .build());
        return token;
    }

    private Optional<RefreshToken> find(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return Optional.empty();
        }
        return refreshTokenRepository.findByTokenHash(hash(refreshToken));
    }

    /** A plain hash is enough: the token is 256 random bits, there is nothing to guess. */
    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    private static ResponseStatusException expired() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, SESSION_EXPIRED);
    }
}
