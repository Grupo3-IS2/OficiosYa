package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.LoginRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.RefreshTokenService;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
@Slf4j
public class AuthServiceImpl implements AuthService {

    private final ClientRepository clientRepository;

    private final PasswordEncoder passwordEncoder;

    private final JwtService jwtService;

    private final TokenRevocationService tokenRevocationService;

    private final RefreshTokenService refreshTokenService;

    private final String dummyPasswordHash;

    public AuthServiceImpl(ClientRepository clientRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
                           TokenRevocationService tokenRevocationService, RefreshTokenService refreshTokenService) {
        this.clientRepository = clientRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenRevocationService = tokenRevocationService;
        this.refreshTokenService = refreshTokenService;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Override
    public LoginResponse login(LoginRequest request) {

        String email = request.getEmail() == null ? "" : request.getEmail().trim().toLowerCase(Locale.ROOT);

        Optional<Client> candidate = clientRepository.findByEmailIgnoreCase(email);
        String passwordHash = candidate.map(Client::getPassword).orElse(dummyPasswordHash);

        if (!passwordEncoder.matches(request.getPassword(), passwordHash) || candidate.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Email o contraseña incorrectos");
        }

        Client user = candidate.get();

        return this.loginResponseFor(user, "Usuario " + user.getEmail() + " inició sesión correctamente");
    }

    @Override
    public String startSession(UUID userId) {
        return refreshTokenService.issue(userId);
    }

    /** The user is read again: their name or role may have changed since the last token. */
    @Override
    public RefreshedLogin refresh(String refreshToken) {
        RefreshTokenService.Rotation rotation = refreshTokenService.rotate(refreshToken);
        Client user = clientRepository.findByPublicId(rotation.userId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "La sesión expiró, iniciá sesión nuevamente"));

        return new RefreshedLogin(this.loginResponseFor(user, "Sesión renovada"), rotation.refreshToken());
    }

    @Override
    public String restartSessions(UUID userId) {
        endSessions(userId);
        return refreshTokenService.issue(userId);
    }

    @Override
    public void endSessions(UUID userId) {
        refreshTokenService.revokeAll(userId);
        tokenRevocationService.revokeSessions(userId);
    }

    @Override
    public TokenResponse verifyUser(HttpServletRequest request) {
        String token = this.getToken(request);
        String subject = token.isEmpty() ? "" : this.jwtService.extractUsername(token);

        if (token.isEmpty() || this.findByPublicId(subject).isEmpty()) {
            return new TokenResponse(false, null, null);
        }
        return new TokenResponse(
                !jwtService.isTokenExpired(token),
                this.jwtService.extractEmisionDate(token),
                this.jwtService.extractExpiration(token));
    }

    /**
     * Revokes the token the request carries and every other token of the same user, refresh tokens
     * included. Without a usable access token (it expired) the refresh token says who the user is.
     */
    @Override
    public MessageResponse logout(HttpServletRequest request, String refreshToken) {
        String token = this.getToken(request);
        boolean hasRefreshToken = refreshToken != null && !refreshToken.isBlank();

        if (token.isEmpty() && !hasRefreshToken) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Falta el token de autenticación");
        }

        Optional<UUID> userId = Optional.empty();

        if (!token.isEmpty()) {
            tokenRevocationService.revoke(token);
            userId = this.findByPublicId(this.subjectOf(token)).map(Client::getPublicId);
        }

        if (userId.isEmpty() && hasRefreshToken) {
            userId = refreshTokenService.ownerOf(refreshToken);
        }

        userId.ifPresent(id -> {
            tokenRevocationService.revokeSessions(id);
            refreshTokenService.revokeAll(id);
        });

        log.info("Token revoked, the user logged out");

        return new MessageResponse("Sesión cerrada correctamente");
    }

    private LoginResponse loginResponseFor(Client user, String message) {
        return new LoginResponse(
                user.getPublicId(),
                jwtService.generateToken(user),
                user.getEmail(),
                user.getName(),
                Role.of(user),
                message);
    }

    private String subjectOf(String token) {
        try {
            return jwtService.extractUsername(token);
        } catch (JwtException _) {
            log.warn("Token with an unreadable subject on logout");
            return "";
        }
    }

    /** The JWT subject is the user's publicId, an unparseable one is simply not a user. */
    private Optional<Client> findByPublicId(String subject) {
        try {
            return clientRepository.findByPublicId(UUID.fromString(subject));
        } catch (IllegalArgumentException _) {
            log.warn("Token with an invalid subject: {}", subject);
            return Optional.empty();
        }
    }

    private String getToken(HttpServletRequest request){
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")){
            return request.getHeader("Authorization").substring(7);
        }
        return "";
    }
}
