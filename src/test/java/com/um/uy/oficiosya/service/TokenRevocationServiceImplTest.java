package com.um.uy.oficiosya.service;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TokenRevocationServiceImplTest {

    @Test
    void revokingSessionsCutsTokensIssuedInTheSameSecondButNotTheOnesIssuedAfter() throws InterruptedException {
        JwtServiceImpl jwtService = new JwtServiceImpl("missing-private.pem", "missing-public.pem");
        ReflectionTestUtils.setField(jwtService, "jwtExpiration", 60_000L);
        TokenRevocationServiceImpl revocation = new TokenRevocationServiceImpl(jwtService);
        UUID user = UUID.randomUUID();

        String before = jwtService.generateToken(new HashMap<>(), user.toString());
        Thread.sleep(2);
        revocation.revokeSessions(user);
        Thread.sleep(2);
        String after = jwtService.generateToken(new HashMap<>(), user.toString());

        assertTrue(revocation.isRevoked(before));
        assertFalse(revocation.isRevoked(after));
    }
}
