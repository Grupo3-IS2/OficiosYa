package com.um.uy.oficiosya.config;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ChatRateLimiterTest {

    private final AtomicLong now = new AtomicLong(1_000_000);

    private final Clock clock = new Clock() {
        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return Instant.ofEpochMilli(now.get());
        }
    };

    private final ChatRateLimiter limiter = new ChatRateLimiter(3, 2, clock);
    private final UUID ana = UUID.randomUUID();
    private final UUID beto = UUID.randomUUID();

    @Test
    void messagesAllowUpToTheLimitPerMinuteAndThenRejectWith429() {
        for (int i = 0; i < 3; i++) {
            assertDoesNotThrow(() -> limiter.checkMessage(ana));
        }

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> limiter.checkMessage(ana));
        assertEquals(429, e.getStatusCode().value());

        now.addAndGet(Duration.ofMinutes(1).toMillis());
        assertDoesNotThrow(() -> limiter.checkMessage(ana));
    }

    @Test
    void newConversationsAllowUpToTheLimitPerDay() {
        limiter.checkNewConversation(ana);
        limiter.checkNewConversation(ana);

        now.addAndGet(Duration.ofHours(23).toMillis());
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> limiter.checkNewConversation(ana));
        assertEquals(429, e.getStatusCode().value());

        now.addAndGet(Duration.ofHours(1).toMillis());
        assertDoesNotThrow(() -> limiter.checkNewConversation(ana));
    }

    @Test
    void eachUserAndEachLimitCountSeparately() {
        for (int i = 0; i < 3; i++) {
            limiter.checkMessage(ana);
        }

        assertDoesNotThrow(() -> limiter.checkMessage(beto));
        assertDoesNotThrow(() -> limiter.checkNewConversation(ana));
    }
}
