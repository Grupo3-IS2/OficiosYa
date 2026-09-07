package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class TokenRevocationServiceImpl implements TokenRevocationService {

    /** Revoked token the moment it expires, after which it can be forgotten. */
    private final Map<String, Date> revokedTokens = new ConcurrentHashMap<>();

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
    public boolean isRevoked(String token) {
        Date expiration = revokedTokens.get(token);

        if (expiration == null) {
            return false;
        }

        if (expiration.before(new Date())) {
            revokedTokens.remove(token);
            return false;
        }

        return true;
    }

    /** Expired tokens are rejected by the filter on their own, so they can be dropped. */
    private void purgeExpired() {
        Date now = new Date();
        revokedTokens.values().removeIf(expiration -> expiration.before(now));
    }
}
