package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.*;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import jakarta.servlet.http.HttpServletRequest;

import java.util.UUID;

public interface AuthService {
    LoginResponse login(LoginRequest request);

    TokenResponse verifyUser(HttpServletRequest request);

    /** Starts the refresh token of a login that just happened, whichever way the user logged in. */
    String startSession(UUID userId);

    /** Exchanges the refresh token for a new access token and the next refresh token. */
    RefreshedLogin refresh(String refreshToken);

    /** Ends every session of the user, found by the access token or, if that expired, by the refresh token. */
    MessageResponse logout(HttpServletRequest request, String refreshToken);

    /**
     * Ends every session of the user (after a password change, so a copy of a token stops working)
     * and answers the refresh token of a new one, so the device that made the change stays logged in.
     */
    String restartSessions(UUID userId);

    record RefreshedLogin(LoginResponse login, String refreshToken) {
    }
}
