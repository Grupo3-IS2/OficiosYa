package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.RefreshToken;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.RefreshTokenRepository;
import com.um.uy.oficiosya.service.interfaces.RefreshTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Issuing, rotating and revoking refresh tokens, with a fixed clock. */
class RefreshTokenServiceImplTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");
    private static final OffsetDateTime NOW_ODT = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);

    @Mock
    private RefreshTokenRepository refreshTokenRepository;
    @Mock
    private ClientRepository clientRepository;

    private RefreshTokenServiceImpl service;

    private final Client user = Client.builder().publicId(UUID.randomUUID()).name("Ana").email("ana@example.com").build();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new RefreshTokenServiceImpl(refreshTokenRepository, clientRepository,
                Clock.fixed(NOW, ZoneOffset.UTC), 7);
        when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private RefreshToken stored(String token) {
        return RefreshToken.builder()
                .user(user)
                .tokenHash(RefreshTokenServiceImpl.hash(token))
                .family(UUID.randomUUID())
                .expiresAt(NOW_ODT.plusDays(3))
                .build();
    }

    @Test
    void issue_storesOnlyTheHashOfARandomToken_thatLastsTheConfiguredDays() {
        when(clientRepository.findByPublicId(user.getPublicId())).thenReturn(Optional.of(user));

        String first = service.issue(user.getPublicId());
        String second = service.issue(user.getPublicId());

        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository, times(2)).save(saved.capture());
        RefreshToken token = saved.getAllValues().getFirst();

        assertNotEquals(first, second);
        assertTrue(first.length() >= 43, "256 random bits, base64url");
        assertEquals(RefreshTokenServiceImpl.hash(first), token.getTokenHash());
        assertNotEquals(first, token.getTokenHash());
        assertEquals(NOW_ODT.plusDays(7), token.getExpiresAt());
        assertNotEquals(token.getFamily(), saved.getAllValues().get(1).getFamily(), "each login is its own family");
    }

    @Test
    void rotate_marksTheTokenUsedAndIssuesTheNextOfTheSameFamily() {
        RefreshToken current = stored("current");
        when(refreshTokenRepository.findByTokenHash(RefreshTokenServiceImpl.hash("current"))).thenReturn(Optional.of(current));

        RefreshTokenService.Rotation rotation = service.rotate("current");

        assertEquals(user.getPublicId(), rotation.userId());
        assertNotEquals("current", rotation.refreshToken());
        assertEquals(NOW_ODT, current.getRotatedAt());

        ArgumentCaptor<RefreshToken> next = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(next.capture());
        assertEquals(current.getFamily(), next.getValue().getFamily());
        assertEquals(RefreshTokenServiceImpl.hash(rotation.refreshToken()), next.getValue().getTokenHash());
        assertEquals(NOW_ODT.plusDays(7), next.getValue().getExpiresAt(), "every use starts the lifetime over");
    }

    @Test
    void rotate_anUnknownMissingOrBlankToken_is401() {
        when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        for (String token : new String[]{"unknown", null, " "}) {
            ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.rotate(token));
            assertEquals(HttpStatus.UNAUTHORIZED, e.getStatusCode());
        }
    }

    @Test
    void rotate_anExpiredOrRevokedToken_is401() {
        RefreshToken expired = stored("expired");
        expired.setExpiresAt(NOW_ODT);
        RefreshToken revoked = stored("revoked");
        revoked.setRevokedAt(NOW_ODT.minusMinutes(1));
        when(refreshTokenRepository.findByTokenHash(RefreshTokenServiceImpl.hash("expired"))).thenReturn(Optional.of(expired));
        when(refreshTokenRepository.findByTokenHash(RefreshTokenServiceImpl.hash("revoked"))).thenReturn(Optional.of(revoked));

        assertThrows(ResponseStatusException.class, () -> service.rotate("expired"));
        assertThrows(ResponseStatusException.class, () -> service.rotate("revoked"));

        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void rotate_aTokenAlreadyRotatedLongAgo_isAStolenCopy_andRevokesTheWholeFamily() {
        RefreshToken reused = stored("reused");
        reused.setRotatedAt(NOW_ODT.minusMinutes(5));
        when(refreshTokenRepository.findByTokenHash(RefreshTokenServiceImpl.hash("reused"))).thenReturn(Optional.of(reused));

        assertThrows(ResponseStatusException.class, () -> service.rotate("reused"));

        verify(refreshTokenRepository).revokeFamily(reused.getFamily(), NOW_ODT);
        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void rotate_aTokenJustRotatedByAnotherTab_is401ButRevokesNothing() {
        RefreshToken justUsed = stored("just-used");
        justUsed.setRotatedAt(NOW_ODT.minusSeconds(5));
        when(refreshTokenRepository.findByTokenHash(RefreshTokenServiceImpl.hash("just-used"))).thenReturn(Optional.of(justUsed));

        assertThrows(ResponseStatusException.class, () -> service.rotate("just-used"));

        verify(refreshTokenRepository, never()).revokeFamily(any(), any());
        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void ownerOf_answersTheUserOfAKnownToken() {
        when(refreshTokenRepository.findByTokenHash(RefreshTokenServiceImpl.hash("known"))).thenReturn(Optional.of(stored("known")));
        when(refreshTokenRepository.findByTokenHash(RefreshTokenServiceImpl.hash("unknown"))).thenReturn(Optional.empty());

        assertEquals(Optional.of(user.getPublicId()), service.ownerOf("known"));
        assertEquals(Optional.empty(), service.ownerOf("unknown"));
        assertEquals(Optional.empty(), service.ownerOf(null));
    }

    @Test
    void revokeAll_revokesEveryTokenOfTheUser() {
        service.revokeAll(user.getPublicId());

        verify(refreshTokenRepository).revokeAllOf(user.getPublicId(), NOW_ODT);
    }
}
