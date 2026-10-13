package com.um.uy.oficiosya.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * The cookie that carries the refresh token. HttpOnly so a script (an XSS) can't read it,
 * SameSite=Strict so another site can't make the browser send it, and scoped to the auth
 * endpoints, the only ones that need it.
 */
@Component
public class RefreshTokenCookie {

    public static final String NAME = "oficiosya_refresh";

    static final String PATH = "/api/v1/auth";

    private final boolean secure;
    private final Duration maxAge;

    public RefreshTokenCookie(@Value("${security.refresh-token.cookie-secure}") boolean secure,
                              @Value("${security.refresh-token.expiration-days}") long lifetimeDays) {
        this.secure = secure;
        this.maxAge = Duration.ofDays(lifetimeDays);
    }

    public ResponseCookie create(String refreshToken) {
        return this.build(refreshToken, maxAge);
    }

    /** Tells the browser to drop it. */
    public ResponseCookie clear() {
        return this.build("", Duration.ZERO);
    }

    private ResponseCookie build(String value, Duration age) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Strict")
                .path(PATH)
                .maxAge(age)
                .build();
    }
}
