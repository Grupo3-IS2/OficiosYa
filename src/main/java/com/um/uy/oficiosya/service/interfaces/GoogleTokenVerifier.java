package com.um.uy.oficiosya.service.interfaces;

public interface GoogleTokenVerifier {

    /**
     * Who Google says the user is. The email is lowercase and Google vouches for it: an ID
     * token whose email is not verified is rejected before it gets here.
     *
     * @param name the display name, or null if the token carries none.
     */
    record GoogleIdentity(String subject, String email, String name) {
    }

    /**
     * Checks the ID token (signature, issuer, audience, expiry) and returns the identity in it.
     * Throws a 401 if the token is not valid for this app, a 400 if its email is not verified,
     * and a 503 if Google sign-in is not configured or Google can't be reached.
     */
    GoogleIdentity verify(String credential);
}
