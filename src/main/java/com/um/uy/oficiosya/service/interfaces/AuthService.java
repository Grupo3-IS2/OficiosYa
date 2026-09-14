package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.*;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import jakarta.servlet.http.HttpServletRequest;

public interface AuthService {
    LoginResponse login(LoginRequest request);

    LoginResponse register(ClientCreateRequest request);

    LoginResponse register(ProfessionalCreateRequest request);

    TokenResponse verifyUser(HttpServletRequest request);

    MessageResponse logout(HttpServletRequest request);
}
