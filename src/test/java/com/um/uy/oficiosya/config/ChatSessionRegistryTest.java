package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Which open sockets get closed: no CONNECT in time, an expired token or a revoked one. */
class ChatSessionRegistryTest {

    private static final Instant OPENED = Instant.parse("2026-10-16T12:00:00Z");

    private final TokenRevocationService revocations = mock(TokenRevocationService.class);
    private final Clock clock = mock(Clock.class);
    private final WebSocketSession session = mock(WebSocketSession.class);
    private ChatSessionRegistry registry;
    private WebSocketHandler handler;

    @BeforeEach
    void setUp() throws Exception {
        registry = new ChatSessionRegistry(revocations, clock);
        handler = registry.decorate(mock(WebSocketHandler.class));
        when(session.getId()).thenReturn("s1");
        at(OPENED);
        handler.afterConnectionEstablished(session);
    }

    private void at(Instant instant) {
        when(clock.instant()).thenReturn(instant);
    }

    @Test
    void aSocketWithoutConnect_isClosedOnceItsTimeIsUp() throws Exception {
        at(OPENED.plus(ChatSessionRegistry.CONNECT_TIMEOUT).minusSeconds(1));
        registry.closeStale();
        verify(session, never()).close(any());

        at(OPENED.plus(ChatSessionRegistry.CONNECT_TIMEOUT).plusSeconds(1));
        registry.closeStale();
        verify(session).close(any(CloseStatus.class));
    }

    @Test
    void anAuthenticatedSocket_staysOpenUntilItsTokenExpires() throws Exception {
        registry.authenticated("s1", "token", OPENED.plusSeconds(600));

        at(OPENED.plusSeconds(300));
        registry.closeStale();
        assertFalse(registry.isExpired("s1"));
        verify(session, never()).close(any());

        at(OPENED.plusSeconds(600));
        assertTrue(registry.isExpired("s1"));
        registry.closeStale();
        verify(session).close(any(CloseStatus.class));
    }

    @Test
    void aRevokedToken_closesItsSocket() throws Exception {
        registry.authenticated("s1", "token", OPENED.plusSeconds(600));
        when(revocations.isRevoked("token")).thenReturn(true);

        registry.closeStale();

        verify(session).close(any(CloseStatus.class));
    }

    @Test
    void aClosedSocket_isForgotten() throws Exception {
        handler.afterConnectionClosed(session, CloseStatus.NORMAL);
        registry.authenticated("s1", "token", OPENED);

        at(OPENED.plusSeconds(3600));
        registry.closeStale();

        assertFalse(registry.isExpired("s1"));
        verify(session, never()).close(any());
    }

    @Test
    void aSocketThatFailsToClose_isOnlyLogged() throws Exception {
        doThrow(new IOException("gone")).when(session).close(any());
        at(OPENED.plusSeconds(3600));

        assertDoesNotThrow(registry::closeStale);
    }
}
