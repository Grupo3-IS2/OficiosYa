package com.um.uy.oficiosya.service.interfaces;

import java.util.UUID;

public interface TokenRevocationService {
    /** Revokes a token, no-op if it is already revoked or already expired. */
    void revoke(String token);

    /** Revokes every token issued to the user before now, so the other tabs are logged out too. */
    void revokeSessions(UUID publicId);

    boolean isRevoked(String token);
}
