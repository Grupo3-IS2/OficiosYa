package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.service.JwtServiceImpl;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.web.servlet.HandlerExceptionResolver;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class JwtAuthenticationFilterTest {

    @Mock
    private JwtServiceImpl jwtService;
    @Mock
    private UserDetailsService userDetailsService;
    @Mock
    private TokenRevocationService tokenRevocationService;
    @Mock
    private HandlerExceptionResolver handlerExceptionResolver;
    @Mock
    private FilterChain filterChain;

    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        SecurityContextHolder.clearContext();
        filter = new JwtAuthenticationFilter(jwtService, userDetailsService, tokenRevocationService, handlerExceptionResolver);
    }

    @Test
    void ignoresAuthEndpointsAndDoesNotTouchJwtServices() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/login");

        filter.doFilter(request, new MockHttpServletResponse(), filterChain);

        verify(filterChain).doFilter(eq(request), any());
        verify(jwtService, never()).extractUsername(any());
    }

    @Test
    void authenticatesAValidBearerToken() throws Exception {
        String token = "token";
        var details = User.withUsername("user-id").password("x").roles("CLIENT").build();
        when(tokenRevocationService.isRevoked(token)).thenReturn(false);
        when(jwtService.extractUsername(token)).thenReturn("user-id");
        when(userDetailsService.loadUserByUsername("user-id")).thenReturn(details);
        when(jwtService.isTokenValid(token, details)).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/clients/me");
        request.addHeader("Authorization", "Bearer " + token);
        filter.doFilter(request, new MockHttpServletResponse(), filterChain);

        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        verify(filterChain).doFilter(eq(request), any());
    }

    @Test
    void leavesRevokedTokensUnauthenticated() throws Exception {
        when(tokenRevocationService.isRevoked("token")).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/clients/me");
        request.addHeader("Authorization", "Bearer token");
        filter.doFilter(request, new MockHttpServletResponse(), filterChain);

        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(jwtService, never()).extractUsername(any());
        verify(filterChain).doFilter(eq(request), any());
    }
}
