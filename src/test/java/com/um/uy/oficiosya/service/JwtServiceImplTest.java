package com.um.uy.oficiosya.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceImplTest {

    @TempDir
    Path temp;

    @Test
    void generatedTokenContainsSubjectClaimsAndIsValid() {
        JwtServiceImpl service = service();
        String subject = UUID.randomUUID().toString();

        String token = service.generateToken(Map.of("role", "CLIENT"), subject);

        assertEquals(subject, service.extractUsername(token));
        assertEquals("CLIENT", service.extractClaim(token, claims -> claims.get("role", String.class)));
        assertNotNull(service.extractExpiration(token));
        assertNotNull(service.extractEmisionDate(token));
        assertFalse(service.isTokenExpired(token));
    }

    @Test
    void malformedAndExpiredTokensAreHandledAsInvalid() {
        JwtServiceImpl service = service();

        assertTrue(service.isTokenExpired("not-a-jwt"));
        assertNull(service.extractExpiration("not-a-jwt"));
        assertFalse(service.isTokenValid("not-a-jwt",
                new org.springframework.security.core.userdetails.User("id", "x", java.util.List.of())));

        ReflectionTestUtils.setField(service, "jwtExpiration", -1L);
        String expired = service.generateToken(Map.of(), "id");
        assertTrue(service.isTokenExpired(expired));
    }

    @Test
    void tokenValidityRequiresMatchingSubject() {
        JwtServiceImpl service = service();
        String token = service.generateToken(Map.of(), "expected");

        assertTrue(service.isTokenValid(token,
                new org.springframework.security.core.userdetails.User("expected", "x", java.util.List.of())));
        assertFalse(service.isTokenValid(token,
                new org.springframework.security.core.userdetails.User("other", "x", java.util.List.of())));
    }

    private JwtServiceImpl service() {
        JwtServiceImpl service = new JwtServiceImpl(
                temp.resolve("missing-private.pem").toString(),
                temp.resolve("missing-public.pem").toString());
        ReflectionTestUtils.setField(service, "jwtExpiration", 60_000L);
        return service;
    }
}
