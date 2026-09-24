package com.um.uy.oficiosya.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.um.uy.oficiosya.service.interfaces.GoogleTokenVerifier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;
import java.util.Locale;

@Service
@Slf4j
public class GoogleTokenVerifierImpl implements GoogleTokenVerifier {

    private static final GsonFactory JSON_FACTORY = GsonFactory.getDefaultInstance();

    /** Null when GOOGLE_CLIENT_ID is not set: Google sign-in is then off. */
    private final GoogleIdTokenVerifier verifier;

    @Autowired
    public GoogleTokenVerifierImpl(@Value("${app.google.client-id:}") String clientId) {
        this(clientId == null || clientId.isBlank() ? null : buildVerifier(clientId.trim()));
        if (verifier == null) {
            log.warn("app.google.client-id is not set: sign-in with Google is disabled. Set GOOGLE_CLIENT_ID to enable it.");
        }
    }

    GoogleTokenVerifierImpl(GoogleIdTokenVerifier verifier) {
        this.verifier = verifier;
    }

    /** Checks signature (Google's public keys, cached), issuer, expiry and that the token was issued for this app. */
    private static GoogleIdTokenVerifier buildVerifier(String clientId) {
        return new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), JSON_FACTORY)
                .setAudience(List.of(clientId))
                .build();
    }

    @Override
    public GoogleIdentity verify(String credential) {
        if (verifier == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "El acceso con Google no está disponible por el momento");
        }

        GoogleIdToken token = parse(credential);

        try {
            if (!verifier.verify(token)) {
                throw invalid();
            }
        } catch (GeneralSecurityException | IOException e) {
            // Not the user's fault: the keys to check the signature couldn't be fetched.
            log.error("Could not verify a Google ID token", e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "No pudimos conectarnos con Google, intentá de nuevo en unos minutos");
        }

        GoogleIdToken.Payload payload = token.getPayload();

        if (!Boolean.TRUE.equals(payload.getEmailVerified())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta de Google no tiene el correo verificado");
        }

        String email = payload.getEmail();
        if (payload.getSubject() == null || email == null || email.isBlank()) {
            throw invalid();
        }

        return new GoogleIdentity(payload.getSubject(), email.trim().toLowerCase(Locale.ROOT),
                (String) payload.get("name"));
    }

    private GoogleIdToken parse(String credential) {
        try {
            return GoogleIdToken.parse(JSON_FACTORY, credential);
        } catch (IOException | RuntimeException e) {
            throw invalid();
        }
    }

    private ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No pudimos validar tu cuenta de Google");
    }
}
