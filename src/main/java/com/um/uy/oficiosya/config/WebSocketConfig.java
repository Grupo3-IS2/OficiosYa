package com.um.uy.oficiosya.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

/**
 * STOMP over plain WebSocket at /ws/chat, only to push to the users (sending goes through REST).
 * It has to be under /ws/: nginx proxies "location /ws/", and a bare /ws gets a 301 that WebSocket
 * clients don't follow. In memory simple broker: fine while a single instance of the app runs.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /** Well below nginx's proxy_read_timeout, so an idle socket isn't cut. */
    private static final long[] HEARTBEAT_MILLIS = {10_000, 10_000};

    private final JwtChannelInterceptor jwtChannelInterceptor;
    private final ChatSessionRegistry sessionRegistry;
    private final TaskScheduler messageBrokerTaskScheduler;
    private final String webUrl;

    public WebSocketConfig(JwtChannelInterceptor jwtChannelInterceptor,
                           ChatSessionRegistry sessionRegistry,
                           @Lazy TaskScheduler messageBrokerTaskScheduler,
                           @Value("${app.web-url:localhost}") String webUrl) {
        this.jwtChannelInterceptor = jwtChannelInterceptor;
        this.sessionRegistry = sessionRegistry;
        this.messageBrokerTaskScheduler = messageBrokerTaskScheduler;
        this.webUrl = webUrl;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/chat")
                .setAllowedOriginPatterns(SecurityConfig.allowedOriginPatterns(webUrl).toArray(String[]::new));
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue")
                .setHeartbeatValue(HEARTBEAT_MILLIS)
                .setTaskScheduler(messageBrokerTaskScheduler);
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(jwtChannelInterceptor);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.addDecoratorFactory(sessionRegistry);
    }
}
