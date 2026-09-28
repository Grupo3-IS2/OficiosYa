package com.um.uy.oficiosya.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Caps how many times one client can hit a sensitive public endpoint per minute (fixed
 * window, in memory, per instance). It exists because the per-email limits (resend cooldown,
 * attempts per code) do nothing against someone asking for codes for many different emails,
 * which would turn the app into a spam relay through the SMTP account.
 *
 * <p>The client is identified by IP. Behind the host's nginx every connection comes from
 * nginx, whose {@code X-Real-IP} carries the real client: nginx overwrites it on {@code /api/}
 * with {@code $remote_addr}, so the client can't choose it. {@code X-Forwarded-For} is not
 * usable for this: nginx appends to whatever the client sent, and with
 * {@code server.forward-headers-strategy=framework} Spring takes its <em>first</em> entry as the
 * remote address, which the client controls. Without the header (running without nginx) it
 * falls back to the connection's own address.
 */
@Component
public class RequestRateLimiter {

    private static final Duration WINDOW = Duration.ofMinutes(1);

    /** Past this many tracked clients, windows that already ended are dropped. */
    private static final int PURGE_THRESHOLD = 10_000;

    private final int maxRequestsPerWindow;
    private final Clock clock;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    @Autowired
    public RequestRateLimiter(@Value("${app.rate-limit.auth-requests-per-minute}") int maxRequestsPerWindow) {
        this(maxRequestsPerWindow, Clock.systemUTC());
    }

    RequestRateLimiter(int maxRequestsPerWindow, Clock clock) {
        this.maxRequestsPerWindow = maxRequestsPerWindow;
        this.clock = clock;
    }

    /** Counts one request of {@code request}'s client against {@code bucket}; throws a 429 past the limit. */
    public void check(HttpServletRequest request, String bucket) {
        long now = clock.millis();
        String key = bucket + ":" + clientIp(request);

        if (windows.size() > PURGE_THRESHOLD) {
            windows.values().removeIf(window -> window.hasEnded(now));
        }

        Window window = windows.compute(key, (k, current) ->
                current == null || current.hasEnded(now) ? new Window(now) : current.increment());

        if (window.count > maxRequestsPerWindow) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Hiciste demasiados intentos, esperá un minuto y probá de nuevo");
        }
    }

    private String clientIp(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
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

        private boolean hasEnded(long now) {
            return now - startedAt >= WINDOW.toMillis();
        }
    }
}
