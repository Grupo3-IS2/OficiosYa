package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.LoginRequestDTO;
import com.um.uy.oficiosya.dto.request.RegisterRequestDTO;
import com.um.uy.oficiosya.dto.response.LoginResponseDTO;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.UserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Date;

@Service
@Slf4j
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;

    private final PasswordEncoder passwordEncoder;

    private final JwtService jwtService;

    private final UserService userService;

    public AuthServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService, UserService userService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.userService = userService;
    }

    @Override
    public LoginResponseDTO login(LoginRequestDTO request) {

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "User not found")
                );

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Email or password incorrect");
        }

        String jwtToken = jwtService.generateToken(user);

        return new LoginResponseDTO(
                jwtToken,
                user.getEmail(),
                user.getName(),
                "User " + user.getEmail() + " logged successfully");
    }

    @Override
    public LoginResponseDTO register(RegisterRequestDTO request) {

        // Create user
        userService.createUser(request);

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "User not found")
                );

        String jwtToken = jwtService.generateToken(user);

        return new LoginResponseDTO(
                jwtToken,
                user.getEmail(),
                user.getName(),
                "User " + user.getEmail() + " logged successfully");

    }

    @Override
    public TokenResponse verifyUser(HttpServletRequest request) {
        String token = this.getToken(request);
        log.info("Token: {}", token);
        String userEmail = this.jwtService.extractUsername(token);

        boolean verified = false;
        Date expirationDate = null;
        Date emissionDate = null;
        if (!token.isEmpty() && userRepository.findByEmail(userEmail).isPresent()) {
            verified = !jwtService.isTokenExpired(token);
            expirationDate = this.jwtService.extractExpiration(token);
            emissionDate = this.jwtService.extractEmisionDate(token);
        }
        return new TokenResponse(verified, emissionDate, expirationDate);

    }

    private String getToken(HttpServletRequest request){
        String authHeader = request.getHeader("Authorization");
        if (authHeader.startsWith("Bearer ")){
            return request.getHeader("Authorization").substring(7);
        }
        return "";
    }
}
