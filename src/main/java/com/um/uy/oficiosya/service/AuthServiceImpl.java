package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.LoginRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.JwtService;
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

    private final UserRepository userRepository;

    private final PasswordEncoder passwordEncoder;

    private final JwtService jwtService;

    private final TokenRevocationService tokenRevocationService;

    private final String dummyPasswordHash;

    public AuthServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
                           TokenRevocationService tokenRevocationService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenRevocationService = tokenRevocationService;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Override
    public LoginResponse login(LoginRequest request) {

        String email = request.getEmail() == null ? "" : request.getEmail().trim().toLowerCase(Locale.ROOT);

        Optional<User> candidate = userRepository.findByEmailIgnoreCase(email);
        String passwordHash = candidate.map(User::getPassword).orElse(dummyPasswordHash);

        if (!passwordEncoder.matches(request.getPassword(), passwordHash) || candidate.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Email o contraseña incorrectos");
        }

        User user = candidate.get();

        String jwtToken = jwtService.generateToken(user);

        return new LoginResponse(
                user.getPublicId(),
                jwtToken,
                user.getEmail(),
                user.getName(),
                Role.of(user),
                "Usuario " + user.getEmail() + " inició sesión correctamente");
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
     * Revokes the token the request carries and every other token of the same user
     */
    @Override
    public MessageResponse logout(HttpServletRequest request) {
        String token = this.getToken(request);

        if (token.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Falta el token de autenticación");
        }

        tokenRevocationService.revoke(token);

        this.findByPublicId(this.subjectOf(token))
                .ifPresent(user -> tokenRevocationService.revokeSessions(user.getPublicId()));

        log.info("Token revoked, the user logged out");

        return new MessageResponse("Sesión cerrada correctamente");
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
    private Optional<User> findByPublicId(String subject) {
        try {
            return userRepository.findByPublicId(UUID.fromString(subject));
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
