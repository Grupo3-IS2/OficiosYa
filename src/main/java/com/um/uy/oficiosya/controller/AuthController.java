package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.LoginRequest;
import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest dto){
        LoginResponse response = authService.login(dto);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register-client")
    public ResponseEntity<LoginResponse> registerClient(@Valid @RequestBody ClientCreateRequest dto){
        LoginResponse response = authService.register(dto);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register-professional")
    public ResponseEntity<LoginResponse> registerProfessional(@Valid @RequestBody ProfessionalCreateRequest dto){
        LoginResponse response = authService.register(dto);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(HttpServletRequest request){
        return ResponseEntity.ok(authService.logout(request));
    }

    @GetMapping("/verify")
    public ResponseEntity<TokenResponse> verify(HttpServletRequest request){
        return ResponseEntity.ok(authService.verifyUser(request));
    }
}
