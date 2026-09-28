package com.um.uy.oficiosya.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RequestRateLimiterTest {

    private final AtomicLong now = new AtomicLong(1_000_000);

    private final Clock clock = new Clock() {
        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return Instant.ofEpochMilli(now.get());
        }
    };

    private final RequestRateLimiter limiter = new RequestRateLimiter(3, clock);

    private MockHttpServletRequest from(String remoteAddr) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        return request;
    }

    @Test
    void allowsUpToTheLimitAndThenRejectsWith429() {
        MockHttpServletRequest request = from("10.0.0.1");

        for (int i = 0; i < 3; i++) {
            assertDoesNotThrow(() -> limiter.check(request, "registration"));
        }

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> limiter.check(request, "registration"));
        assertEquals(429, e.getStatusCode().value());
    }

    @Test
    void countsEachClientAndEachBucketSeparately() {
        for (int i = 0; i < 3; i++) {
            limiter.check(from("10.0.0.1"), "registration");
        }

        assertDoesNotThrow(() -> limiter.check(from("10.0.0.2"), "registration"));
        assertDoesNotThrow(() -> limiter.check(from("10.0.0.1"), "other"));
    }

    @Test
    void startsFreshOnceTheWindowEnded() {
        MockHttpServletRequest request = from("10.0.0.1");
        for (int i = 0; i < 3; i++) {
            limiter.check(request, "registration");
        }
        assertThrows(ResponseStatusException.class, () -> limiter.check(request, "registration"));

        now.addAndGet(60_000);

        assertDoesNotThrow(() -> limiter.check(request, "registration"));
    }

    @Test
    void theConstructorSpringUses_countsWithTheSystemClock() {
        RequestRateLimiter real = new RequestRateLimiter(2);
        MockHttpServletRequest request = from("10.0.0.9");

        real.check(request, "registration");
        real.check(request, "registration");

        assertThrows(ResponseStatusException.class, () -> real.check(request, "registration"));
    }

    @Test
    void aBlankXRealIp_fallsBackToTheConnectionAddress() {
        for (int i = 0; i < 3; i++) {
            MockHttpServletRequest request = from("10.0.0.5");
            request.addHeader("X-Real-IP", "   ");
            limiter.check(request, "registration");
        }
        var client = from("10.0.0.5");

        assertThrows(ResponseStatusException.class, () -> limiter.check(client, "registration"));
    }

    @Test
    void windowsThatAlreadyEnded_areDroppedOnceTooManyClientsAreTracked() {
        // Enough different clients to pass the purge threshold, then time moves past their window.
        for (int i = 0; i < 10_050; i++) {
            limiter.check(from("10." + (i / 65536) + "." + ((i / 256) % 256) + "." + (i % 256)), "registration");
        }
        now.addAndGet(61_000);

        // The next check purges the ended windows and still counts normally afterwards.
        MockHttpServletRequest request = from("192.168.0.1");
        for (int i = 0; i < 3; i++) {
            assertDoesNotThrow(() -> limiter.check(request, "registration"));
        }
        assertThrows(ResponseStatusException.class, () -> limiter.check(request, "registration"));
    }

    @Test
    void behindTheProxy_theClientIsWhoNginxReportsInXRealIp() {
        for (int i = 0; i < 3; i++) {
            MockHttpServletRequest request = from("172.18.0.1");
            request.addHeader("X-Real-IP", "203.0.113.7");
            limiter.check(request, "registration");
        }

        MockHttpServletRequest sameClientAgain = from("172.18.0.1");
        sameClientAgain.addHeader("X-Real-IP", "203.0.113.7");
        assertThrows(ResponseStatusException.class, () -> limiter.check(sameClientAgain, "registration"));

        MockHttpServletRequest anotherClient = from("172.18.0.1");
        anotherClient.addHeader("X-Real-IP", "203.0.113.8");
        assertDoesNotThrow(() -> limiter.check(anotherClient, "registration"));
    }

    @Test
    void anXForwardedForTheClientMadeUpDoesNotGiveItAFreshQuota() {
        // Whatever the client puts in X-Forwarded-For (in any position) must not change who it is.
        for (int i = 0; i < 3; i++) {
            MockHttpServletRequest request = from("172.18.0.1");
            request.addHeader("X-Real-IP", "203.0.113.7");
            request.addHeader("X-Forwarded-For", "spoofed-" + i + ", 203.0.113.7");
            limiter.check(request, "registration");
        }

        MockHttpServletRequest again = from("172.18.0.1");
        again.addHeader("X-Real-IP", "203.0.113.7");
        again.addHeader("X-Forwarded-For", "yet-another-fake");
        assertThrows(ResponseStatusException.class, () -> limiter.check(again, "registration"));
    }
}
