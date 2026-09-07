package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.LoginRequestDTO;
import com.um.uy.oficiosya.dto.request.RegisterRequestDTO;
import com.um.uy.oficiosya.dto.response.LoginResponseDTO;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import jakarta.servlet.http.HttpServletRequest;
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
    public ResponseEntity<LoginResponseDTO> login(@RequestBody LoginRequestDTO dto){
        LoginResponseDTO response = authService.login(dto);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register")
    public ResponseEntity<LoginResponseDTO> register(@RequestBody RegisterRequestDTO dto){
        LoginResponseDTO response = authService.register(dto);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/verify")
    public ResponseEntity<TokenResponse> verify(HttpServletRequest request){
        return ResponseEntity.ok(authService.verifyUser(request));
    }
}
