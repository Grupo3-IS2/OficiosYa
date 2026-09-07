package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.LoginRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import com.um.uy.oficiosya.service.interfaces.TokenRevocationService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Date;
import java.util.Optional;
import java.util.UUID;

@Service
@Slf4j
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;

    private final PasswordEncoder passwordEncoder;

    private final JwtService jwtService;

    private final ClientService clientService;

    private final ProfessionalService professionalService;

    private final TokenRevocationService tokenRevocationService;

    public AuthServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
                           ClientService clientService, ProfessionalService professionalService,
                           TokenRevocationService tokenRevocationService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.clientService = clientService;
        this.professionalService = professionalService;
        this.tokenRevocationService = tokenRevocationService;
    }

    @Override
    public LoginResponse login(LoginRequest request) {

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "User not found")
                );

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Email or password incorrect");
        }

        String jwtToken = jwtService.generateToken(user);

        return new LoginResponse(
                user.getPublicId(),
                jwtToken,
                user.getEmail(),
                user.getName(),
                "User " + user.getEmail() + " logged successfully");
    }

    @Override
    public LoginResponse register(ClientCreateRequest request) {
        clientService.createClient(request);
        return this.loginResponseFor(request.getEmail());
    }

    @Override
    public LoginResponse register(ProfessionalCreateRequest request) {
        professionalService.createProfessional(request);
        return this.loginResponseFor(request.getEmail());
    }

    private LoginResponse loginResponseFor(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "User not found")
                );

        String jwtToken = jwtService.generateToken(user);

        return new LoginResponse(
                user.getPublicId(),
                jwtToken,
                user.getEmail(),
                user.getName(),
                "User " + user.getEmail() + " registered successfully");
    }

    @Override
    public TokenResponse verifyUser(HttpServletRequest request) {
        String token = this.getToken(request);
        String subject = token.isEmpty() ? "" : this.jwtService.extractUsername(token);

        boolean verified = false;
        Date expirationDate = null;
        Date emissionDate = null;
        if (!token.isEmpty() && this.findByPublicId(subject).isPresent()) {
            verified = !jwtService.isTokenExpired(token);
            expirationDate = this.jwtService.extractExpiration(token);
            emissionDate = this.jwtService.extractEmisionDate(token);
        }
        return new TokenResponse(verified, emissionDate, expirationDate);

    }

    /**
     * Revokes the token the request carries, so it cannot be used again even though it
     * has not expired yet. The client is still expected to drop its copy of the token.
     */
    @Override
    public MessageResponse logout(HttpServletRequest request) {
        String token = this.getToken(request);

        if (token.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Missing authentication token");
        }

        tokenRevocationService.revoke(token);
        log.info("Token revoked, the user logged out");

        return new MessageResponse("User logged out successfully");
    }

    /** The JWT subject is the user's publicId, an unparseable one is simply not a user. */
    private Optional<User> findByPublicId(String subject) {
        try {
            return userRepository.findByPublicId(UUID.fromString(subject));
        } catch (IllegalArgumentException e) {
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
