package com.um.uy.oficiosya.config;

import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/** For the /me endpoints: the caller acts on their own account, identified by the token alone. */
public final class AuthenticatedUser {

    private AuthenticatedUser() {
    }

    public static UUID id(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes de iniciar sesión");
        }

        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "El token de autenticación es inválido");
        }
    }
}
