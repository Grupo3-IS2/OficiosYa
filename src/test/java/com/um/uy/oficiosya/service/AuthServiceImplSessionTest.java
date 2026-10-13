package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.RefreshTokenService;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Renewing, ending and restarting sessions: how the access token and the refresh tokens go together. */
class AuthServiceImplSessionTest {

    @Mock
    private ClientRepository clientRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private JwtService jwtService;
    @Mock
    private TokenRevocationService tokenRevocationService;
    @Mock
    private RefreshTokenService refreshTokenService;

    private AuthServiceImpl service;

    private final Client user = Client.builder().publicId(UUID.randomUUID()).name("Ana").email("ana@example.com").build();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        when(passwordEncoder.encode(any())).thenReturn("dummy");
        service = new AuthServiceImpl(clientRepository, passwordEncoder, jwtService, tokenRevocationService, refreshTokenService);
        when(jwtService.generateToken(user)).thenReturn("new-access");
    }

    private MockHttpServletRequest withBearer(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    @Test
    void startSession_issuesTheUsersFirstRefreshToken() {
        when(refreshTokenService.issue(user.getPublicId())).thenReturn("refresh");

        assertEquals("refresh", service.startSession(user.getPublicId()));
    }

    @Test
    void refresh_answersANewAccessTokenWithTheUsersCurrentData_andTheNextRefreshToken() {
        when(refreshTokenService.rotate("old")).thenReturn(new RefreshTokenService.Rotation(user.getPublicId(), "next"));
        when(clientRepository.findByPublicId(user.getPublicId())).thenReturn(Optional.of(user));

        AuthService.RefreshedLogin refreshed = service.refresh("old");

        assertEquals("next", refreshed.refreshToken());
        assertEquals("new-access", refreshed.login().getToken());
        assertEquals(user.getPublicId(), refreshed.login().getId());
        assertEquals("ana@example.com", refreshed.login().getEmail());
        assertEquals(Role.CLIENT, refreshed.login().getRole());
    }

    @Test
    void refresh_withARejectedToken_passesThe401Along() {
        when(refreshTokenService.rotate("bad")).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.refresh("bad"));
        assertEquals(HttpStatus.UNAUTHORIZED, e.getStatusCode());
    }

    @Test
    void logout_withTheAccessToken_endsEverySessionOfTheUser_refreshTokensIncluded() {
        when(jwtService.extractUsername("access")).thenReturn(user.getPublicId().toString());
        when(clientRepository.findByPublicId(user.getPublicId())).thenReturn(Optional.of(user));

        service.logout(withBearer("access"), null);

        verify(tokenRevocationService).revoke("access");
        verify(tokenRevocationService).revokeSessions(user.getPublicId());
        verify(refreshTokenService).revokeAll(user.getPublicId());
    }

    @Test
    void logout_withOnlyTheRefreshCookie_findsTheUserByIt() {
        when(refreshTokenService.ownerOf("refresh")).thenReturn(Optional.of(user.getPublicId()));

        service.logout(new MockHttpServletRequest(), "refresh");

        verify(tokenRevocationService, never()).revoke(any());
        verify(tokenRevocationService).revokeSessions(user.getPublicId());
        verify(refreshTokenService).revokeAll(user.getPublicId());
    }

    @Test
    void logout_withNeitherToken_is401() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.logout(new MockHttpServletRequest(), null));

        assertEquals(HttpStatus.UNAUTHORIZED, e.getStatusCode());
    }

    @Test
    void restartSessions_revokesEverythingBeforeIssuingTheNewSession() {
        when(refreshTokenService.issue(user.getPublicId())).thenReturn("fresh");

        assertEquals("fresh", service.restartSessions(user.getPublicId()));

        var order = inOrder(refreshTokenService, tokenRevocationService);
        order.verify(refreshTokenService).revokeAll(user.getPublicId());
        order.verify(tokenRevocationService).revokeSessions(user.getPublicId());
        order.verify(refreshTokenService).issue(user.getPublicId());
    }
}
