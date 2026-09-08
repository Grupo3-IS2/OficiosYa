package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import io.jsonwebtoken.JwtException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class TokenRevocationServiceImpl implements TokenRevocationService {

    /** Revoked token the moment it expires, after which it can be forgotten. */
    private final Map<String, Date> revokedTokens = new ConcurrentHashMap<>();

    /** Moment every token of a user stopped being valid, whichever tab it was issued to. */
    private final Map<String, Date> revokedSessions = new ConcurrentHashMap<>();

    private final JwtService jwtService;

    public TokenRevocationServiceImpl(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    public void revoke(String token) {
        Date expiration = jwtService.extractExpiration(token);

        if (expiration == null) {
            expiration = new Date(System.currentTimeMillis() + jwtService.getExpirationTime());
        }

        if (expiration.before(new Date())) {
            log.info("Token already expired, there is nothing to revoke");
            return;
        }

        this.purgeExpired();
        revokedTokens.put(token, expiration);
    }

    @Override
    public void revokeSessions(UUID publicId) {
        revokedSessions.put(publicId.toString(), new Date(System.currentTimeMillis() / 1000L * 1000L));
    }

    @Override
    public boolean isRevoked(String token) {
        Date expiration = revokedTokens.get(token);

        if (expiration != null && expiration.before(new Date())) {
            revokedTokens.remove(token);
            expiration = null;
        }

        return expiration != null || this.belongsToARevokedSession(token);
    }

    private boolean belongsToARevokedSession(String token) {
        try {
            Date cutOff = revokedSessions.get(jwtService.extractUsername(token));
            Date issuedAt = jwtService.extractEmisionDate(token);

            return cutOff != null && issuedAt != null && issuedAt.before(cutOff);
        } catch (JwtException e) {
            log.warn("Token that cannot be read is left to the filter to reject");
            return false;
        }
    }

    /** Expired tokens are rejected by the filter on their own, so they can be dropped. */
    private void purgeExpired() {
        Date now = new Date();
        revokedTokens.values().removeIf(expiration -> expiration.before(now));
        revokedSessions.values().removeIf(cutOff -> cutOff.before(new Date(now.getTime() - jwtService.getExpirationTime())));
    }
}
