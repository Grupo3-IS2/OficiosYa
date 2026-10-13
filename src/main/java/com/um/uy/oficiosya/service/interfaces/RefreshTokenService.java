package com.um.uy.oficiosya.service.interfaces;

import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenService {

    /** Starts a new login's family and answers its first token, to go in the cookie. */
    String issue(UUID userId);

    /**
     * Exchanges a token for the next one of its family. Throws a 401 if it is unknown, expired,
     * revoked or already exchanged; in that last case the whole family is revoked too.
     */
    Rotation rotate(String refreshToken);

    /** Whose token it is, if it is still one we know of. */
    Optional<UUID> ownerOf(String refreshToken);

    /** Ends every login of the user, on every device. */
    void revokeAll(UUID userId);

    record Rotation(UUID userId, String refreshToken) {
    }
}
