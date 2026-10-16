package com.um.uy.oficiosya.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per user caps on the chat, the same fixed window idea as {@link RequestRateLimiter} but keyed by
 * the user's publicId instead of the IP, since every chat request is authenticated. The cap on new
 * conversations is the main brake on a client sending the same message to every professional.
 * In memory, per instance.
 */
@Component
public class ChatRateLimiter {

    private final FixedWindowCounter messages;
    private final FixedWindowCounter newConversations;

    @Autowired
    public ChatRateLimiter(@Value("${app.rate-limit.chat-messages-per-minute}") int messagesPerMinute,
                           @Value("${app.rate-limit.chat-new-conversations-per-day}") int newConversationsPerDay,
                           Clock clock) {
        this.messages = new FixedWindowCounter(messagesPerMinute, Duration.ofMinutes(1), clock);
        this.newConversations = new FixedWindowCounter(newConversationsPerDay, Duration.ofDays(1), clock);
    }

    /** Counts one message sent by the user; throws a 429 past the limit. */
    public void checkMessage(UUID userId) {
        if (messages.countAndCheckExceeded(userId)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Estás mandando demasiados mensajes, esperá un minuto y probá de nuevo");
        }
    }

    /** Counts one conversation the user is about to create (not one that already existed); 429 past the limit. */
    public void checkNewConversation(UUID userId) {
        if (newConversations.countAndCheckExceeded(userId)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Llegaste al límite de conversaciones nuevas por hoy, probá de nuevo mañana");
        }
    }

    private static final class FixedWindowCounter {

        /** Past this many tracked users, windows that already ended are dropped. */
        private static final int PURGE_THRESHOLD = 10_000;

        private final int max;
        private final long windowMillis;
        private final Clock clock;
        private final ConcurrentHashMap<UUID, Window> windows = new ConcurrentHashMap<>();

        private FixedWindowCounter(int max, Duration window, Clock clock) {
            this.max = max;
            this.windowMillis = window.toMillis();
            this.clock = clock;
        }

        /** Counts one more for the user and says whether that went past the limit. */
        private boolean countAndCheckExceeded(UUID userId) {
            long now = clock.millis();

            if (windows.size() > PURGE_THRESHOLD) {
                windows.values().removeIf(window -> now - window.startedAt >= windowMillis);
            }

            Window window = windows.compute(userId, (_, current) ->
                    current == null || now - current.startedAt >= windowMillis ? new Window(now) : current.increment());
            return window.count > max;
        }
    }

    private static final class Window {
        private final long startedAt;
        private int count;

        private Window(long startedAt) {
            this.startedAt = startedAt;
            this.count = 1;
        }

        private Window increment() {
            count++;
            return this;
        }
    }
}
