package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.LoginRequestDTO;
import com.um.uy.oficiosya.dto.request.RegisterRequestDTO;
import com.um.uy.oficiosya.dto.response.LoginResponseDTO;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import jakarta.servlet.http.HttpServletRequest;

public interface AuthService {
    LoginResponseDTO login(LoginRequestDTO request);

    LoginResponseDTO register(RegisterRequestDTO request);

    TokenResponse verifyUser(HttpServletRequest request);
}
