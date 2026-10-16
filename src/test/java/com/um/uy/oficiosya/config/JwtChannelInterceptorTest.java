package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A STOMP session needs a valid token to connect, and can only listen to its own queues. */
class JwtChannelInterceptorTest {

    private final JwtService jwtService = mock(JwtService.class);
    private final UserDetailsService userDetailsService = mock(UserDetailsService.class);
    private final TokenRevocationService tokenRevocationService = mock(TokenRevocationService.class);
    private final ChatSessionRegistry sessionRegistry = mock(ChatSessionRegistry.class);
    private final MessageChannel channel = mock(MessageChannel.class);
    private final JwtChannelInterceptor interceptor =
            new JwtChannelInterceptor(jwtService, userDetailsService, tokenRevocationService, sessionRegistry);

    private final UserDetails user = User.withUsername("user-id").password("x").roles("CLIENT").build();

    @BeforeEach
    void setUp() {
        when(jwtService.extractUsername("good")).thenReturn("user-id");
        when(userDetailsService.loadUserByUsername("user-id")).thenReturn(user);
        when(jwtService.isTokenValid("good", user)).thenReturn(true);
        when(jwtService.extractExpiration("good")).thenReturn(new Date(System.currentTimeMillis() + 60_000));
    }

    private static Message<byte[]> frame(StompCommand command, String authorization, String destination, boolean signedIn) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        accessor.setSessionId("s1");
        if (authorization != null) {
            accessor.setNativeHeader("Authorization", authorization);
        }
        if (destination != null) {
            accessor.setDestination(destination);
        }
        if (signedIn) {
            accessor.setUser(new UsernamePasswordAuthenticationToken("user-id", null, List.of()));
        }
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    void connect_withAValidToken_authenticatesTheSession() {
        Message<byte[]> message = frame(StompCommand.CONNECT, "Bearer good", null, false);

        interceptor.preSend(message, channel);

        assertNotNull(StompHeaderAccessor.wrap(message).getUser());
        verify(sessionRegistry).authenticated(any(), any(), any());
    }

    @Test
    void connect_withoutAToken_isRefused() {
        assertThrows(MessageDeliveryException.class,
                () -> interceptor.preSend(frame(StompCommand.CONNECT, null, null, false), channel));
        verify(sessionRegistry, never()).authenticated(any(), any(), any());
    }

    @Test
    void connect_withAnInvalidToken_isRefused() {
        when(jwtService.extractUsername("bad")).thenThrow(new IllegalArgumentException("malformed"));

        assertThrows(MessageDeliveryException.class,
                () -> interceptor.preSend(frame(StompCommand.CONNECT, "Bearer bad", null, false), channel));
    }

    @Test
    void connect_withAnExpiredToken_isRefused() {
        when(jwtService.extractUsername("old")).thenReturn("user-id");
        when(jwtService.isTokenValid("old", user)).thenReturn(false);

        assertThrows(MessageDeliveryException.class,
                () -> interceptor.preSend(frame(StompCommand.CONNECT, "Bearer old", null, false), channel));
    }

    @Test
    void connect_withARevokedToken_isRefused() {
        when(tokenRevocationService.isRevoked("good")).thenReturn(true);

        assertThrows(MessageDeliveryException.class,
                () -> interceptor.preSend(frame(StompCommand.CONNECT, "Bearer good", null, false), channel));
        verify(jwtService, never()).extractUsername(anyString());
    }

    @Test
    void subscribe_onlyToTheUsersOwnQueues() {
        assertDoesNotThrow(() -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, null, "/user/queue/messages", true), channel));
        assertThrows(MessageDeliveryException.class,
                () -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, null, "/queue/messages", true), channel));
        assertThrows(MessageDeliveryException.class,
                () -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, null, "/user/other/queue/messages", true), channel));
    }

    @Test
    void anythingButConnect_withoutAnAuthenticatedOrWithAnExpiredSession_isRefused() {
        assertThrows(MessageDeliveryException.class,
                () -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, null, "/user/queue/messages", false), channel));

        when(sessionRegistry.isExpired("s1")).thenReturn(true);
        assertThrows(MessageDeliveryException.class,
                () -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, null, "/user/queue/messages", true), channel));
    }
}
