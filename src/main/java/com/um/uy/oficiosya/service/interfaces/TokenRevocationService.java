package com.um.uy.oficiosya.service.interfaces;

public interface TokenRevocationService {
    /** Revokes a token, no-op if it is already revoked or already expired. */
    void revoke(String token);

    boolean isRevoked(String token);
}
