package com.um.uy.oficiosya.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Who gets the owner's view of a public resource: the owner and admins, never anonymous callers. */
class ViewerAccessTest {

    private final UUID ownerId = UUID.randomUUID();

    private Authentication signedIn(UUID id, String role) {
        return new UsernamePasswordAuthenticationToken(id.toString(), "n/a", List.of(new SimpleGrantedAuthority(role)));
    }

    @Test
    void theOwner_isOwnerOrAdmin() {
        assertTrue(ViewerAccess.isOwnerOrAdmin(signedIn(ownerId, "ROLE_PROFESSIONAL"), ownerId));
    }

    @Test
    void anAdmin_isOwnerOrAdmin() {
        assertTrue(ViewerAccess.isOwnerOrAdmin(signedIn(UUID.randomUUID(), "ROLE_ADMIN"), ownerId));
    }

    @Test
    void anotherUser_isNot() {
        assertFalse(ViewerAccess.isOwnerOrAdmin(signedIn(UUID.randomUUID(), "ROLE_CLIENT"), ownerId));
    }

    @Test
    void anonymousCallers_areNot() {
        Authentication anonymous = new AnonymousAuthenticationToken("key", "anonymousUser",
                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
        Authentication unauthenticated = UsernamePasswordAuthenticationToken.unauthenticated(ownerId.toString(), "n/a");

        assertFalse(ViewerAccess.isOwnerOrAdmin(null, ownerId));
        assertFalse(ViewerAccess.isOwnerOrAdmin(anonymous, ownerId));
        assertFalse(ViewerAccess.isOwnerOrAdmin(unauthenticated, ownerId));
    }
}
