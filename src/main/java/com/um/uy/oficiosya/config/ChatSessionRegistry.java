package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Keeps the open chat sockets with the token each one authenticated with, and closes the ones whose
 * token expired or was revoked (logout, password change): an open socket must not outlive its JWT.
 * Also closes sockets that never completed a STOMP CONNECT. In memory, per instance.
 */
@Component
@Slf4j
public class ChatSessionRegistry implements WebSocketHandlerDecoratorFactory {

    /** Time a socket gets to send a valid CONNECT. */
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(30);

    private final Map<String, OpenSocket> sockets = new ConcurrentHashMap<>();
    private final TokenRevocationService tokenRevocationService;
    private final Clock clock;

    public ChatSessionRegistry(TokenRevocationService tokenRevocationService, Clock clock) {
        this.tokenRevocationService = tokenRevocationService;
        this.clock = clock;
    }

    @Override
    public WebSocketHandler decorate(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
            @Override
            public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                sockets.put(session.getId(), new OpenSocket(session, clock.instant(), null, null));
                super.afterConnectionEstablished(session);
            }

            @Override
            public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
                sockets.remove(session.getId());
                super.afterConnectionClosed(session, closeStatus);
            }
        };
    }

    /** Called on an accepted CONNECT; the STOMP session id is the WebSocket session's. */
    public void authenticated(String sessionId, String token, Instant expiresAt) {
        sockets.computeIfPresent(sessionId, (_, socket) -> new OpenSocket(socket.session(), socket.openedAt(), token, expiresAt));
    }

    public boolean isExpired(String sessionId) {
        OpenSocket socket = sockets.get(sessionId);
        return socket != null && socket.expiresAt() != null && !socket.expiresAt().isAfter(clock.instant());
    }

    @Scheduled(fixedDelayString = "PT30S", initialDelayString = "PT30S")
    public void closeStale() {
        Instant now = clock.instant();
        sockets.values().forEach(socket -> {
            boolean stale = socket.token() == null
                    ? socket.openedAt().plus(CONNECT_TIMEOUT).isBefore(now)
                    : !socket.expiresAt().isAfter(now) || tokenRevocationService.isRevoked(socket.token());
            if (stale) {
                close(socket.session());
            }
        });
    }

    private void close(WebSocketSession session) {
        sockets.remove(session.getId());
        try {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("Sesión vencida"));
        } catch (IOException e) {
            log.warn("Could not close chat socket {}: {}", session.getId(), e.getMessage());
        }
    }

    private record OpenSocket(WebSocketSession session, Instant openedAt, String token, Instant expiresAt) {
    }
}
