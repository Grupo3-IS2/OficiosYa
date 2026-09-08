package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.service.JwtServiceImpl;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

@Component
@Slf4j
public class JwtChannelInterceptor implements ChannelInterceptor {

    private final JwtServiceImpl jwtService;
    private final UserDetailsService userDetailsService;
    private final TokenRevocationService tokenRevocationService;

    public JwtChannelInterceptor(JwtServiceImpl jwtService, UserDetailsService userDetailsService,
                                 TokenRevocationService tokenRevocationService) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.tokenRevocationService = tokenRevocationService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");

            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);

                if (tokenRevocationService.isRevoked(token)) {
                    log.warn("Revoked token used to open a WebSocket connection");
                    return message;
                }

                try {
                    String username = jwtService.extractUsername(token);
                    UserDetails userDetails = userDetailsService.loadUserByUsername(username);

                    if (jwtService.isTokenValid(token, userDetails)) {
                        UsernamePasswordAuthenticationToken authentication =
                                new UsernamePasswordAuthenticationToken(
                                        userDetails,
                                        null,
                                        userDetails.getAuthorities()
                                );

                        accessor.setUser(authentication);
                    } else {
                        log.warn("Invalid token for user: {}", username);
                    }
                } catch (Exception e) {
                    log.error("Error processing JWT with WebSocket: {}", e.getMessage());
                }
            } else {
                log.warn("Auth JWT WebSocket token not found");
            }
        }

        return message;
    }
}
