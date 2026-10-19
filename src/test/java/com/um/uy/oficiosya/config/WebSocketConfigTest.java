package com.um.uy.oficiosya.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.StompWebSocketEndpointRegistration;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketConfigTest {

    @Mock
    private JwtChannelInterceptor jwtChannelInterceptor;
    @Mock
    private ChatSessionRegistry sessionRegistry;
    @Mock
    private TaskScheduler taskScheduler;
    @Mock
    private StompEndpointRegistry endpointRegistry;
    @Mock
    private StompWebSocketEndpointRegistration endpoint;
    @Mock
    private MessageBrokerRegistry brokerRegistry;
    @Mock
    private ChannelRegistration channelRegistration;
    @Mock
    private WebSocketTransportRegistration transportRegistration;

    private WebSocketConfig config;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        config = new WebSocketConfig(jwtChannelInterceptor, sessionRegistry, taskScheduler, "oficiosya.example.com");
        when(endpointRegistry.addEndpoint("/ws/chat")).thenReturn(endpoint);
        when(endpoint.setAllowedOriginPatterns(any(String[].class))).thenReturn(endpoint);
    }

    @Test
    void registersChatEndpointWithConfiguredOrigins() {
        config.registerStompEndpoints(endpointRegistry);

        verify(endpointRegistry).addEndpoint("/ws/chat");
        verify(endpoint).setAllowedOriginPatterns(any(String[].class));
    }

    @Test
    void configuresBrokerPrefixesAndHeartbeat() {
        var simpleBroker = org.mockito.Mockito.mock(
                org.springframework.messaging.simp.config.SimpleBrokerRegistration.class);
        when(brokerRegistry.enableSimpleBroker("/queue")).thenReturn(simpleBroker);
        when(simpleBroker.setHeartbeatValue(any(long[].class))).thenReturn(simpleBroker);

        config.configureMessageBroker(brokerRegistry);

        verify(brokerRegistry).enableSimpleBroker("/queue");
        verify(simpleBroker).setHeartbeatValue(new long[]{10_000, 10_000});
        verify(simpleBroker).setTaskScheduler(taskScheduler);
        verify(brokerRegistry).setApplicationDestinationPrefixes("/app");
        verify(brokerRegistry).setUserDestinationPrefix("/user");
    }

    @Test
    void installsJwtInterceptorAndSessionDecorator() {
        config.configureClientInboundChannel(channelRegistration);
        config.configureWebSocketTransport(transportRegistration);

        verify(channelRegistration).interceptors(jwtChannelInterceptor);
        verify(transportRegistration).addDecoratorFactory(sessionRegistry);
    }
}
