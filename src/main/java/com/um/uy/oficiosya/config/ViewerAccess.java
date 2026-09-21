package com.um.uy.oficiosya.config;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;

import java.util.UUID;

/** For public endpoints that show more to the owner of the data than to everyone else. */
public final class ViewerAccess {

    private ViewerAccess() {
    }

    /** True for the account with that publicId (the JWT subject) and for admins. Anonymous callers never are. */
    public static boolean isOwnerOrAdmin(Authentication authentication, UUID ownerId) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            return false;
        }

        return ownerId.toString().equals(authentication.getName())
                || authentication.getAuthorities().stream()
                        .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }
}
