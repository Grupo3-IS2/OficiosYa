package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;

/**
 * Authenticates the STOMP CONNECT with the JWT in its Authorization header (a browser can't send it on
 * the WebSocket handshake) and refuses it without a valid one. Afterwards only subscriptions to the
 * user's own queues are allowed, and nothing once the token expired. Tokens are never logged.
 */
@Component
@Slf4j
public class JwtChannelInterceptor implements ChannelInterceptor {

    static final String USER_QUEUES = "/user/queue/";

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;
    private final TokenRevocationService tokenRevocationService;
    private final ChatSessionRegistry sessionRegistry;

    public JwtChannelInterceptor(JwtService jwtService, UserDetailsService userDetailsService,
                                 TokenRevocationService tokenRevocationService, ChatSessionRegistry sessionRegistry) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.tokenRevocationService = tokenRevocationService;
        this.sessionRegistry = sessionRegistry;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }

        StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT) {
            authenticate(accessor, message);
            return message;
        }
        if (command == StompCommand.DISCONNECT) {
            return message;
        }

        if (accessor.getUser() == null || sessionRegistry.isExpired(accessor.getSessionId())) {
            throw new MessageDeliveryException(message, "Sesión no autenticada o vencida");
        }
        // The user destinations resolve to the caller's own queues: nobody can listen to someone else's
        if (command == StompCommand.SUBSCRIBE
                && (accessor.getDestination() == null || !accessor.getDestination().startsWith(USER_QUEUES))) {
            throw new MessageDeliveryException(message, "Solo puedes suscribirte a " + USER_QUEUES + "**");
        }
        return message;
    }

    private void authenticate(StompHeaderAccessor accessor, Message<?> message) {
        String authHeader = accessor.getFirstNativeHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            log.warn("WebSocket CONNECT refused: no token");
            throw new MessageDeliveryException(message, "Falta el token de acceso");
        }

        String token = authHeader.substring(7);
        if (tokenRevocationService.isRevoked(token)) {
            log.warn("WebSocket CONNECT refused: revoked token");
            throw new MessageDeliveryException(message, "Token revocado");
        }

        UserDetails userDetails;
        try {
            userDetails = userDetailsService.loadUserByUsername(jwtService.extractUsername(token));
            if (!jwtService.isTokenValid(token, userDetails)) {
                throw new IllegalArgumentException("invalid token");
            }
        } catch (RuntimeException e) {
            log.warn("WebSocket CONNECT refused: invalid token ({})", e.getClass().getSimpleName());
            throw new MessageDeliveryException(message, "Token inválido");
        }

        accessor.setUser(new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities()));
        sessionRegistry.authenticated(accessor.getSessionId(), token, jwtService.extractExpiration(token).toInstant());
    }
}
