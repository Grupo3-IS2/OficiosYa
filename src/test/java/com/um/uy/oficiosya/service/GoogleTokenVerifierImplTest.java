package com.um.uy.oficiosya.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.um.uy.oficiosya.service.interfaces.GoogleTokenVerifier.GoogleIdentity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * The signature, issuer, audience and expiry are checked by Google's own library (mocked
 * here); these tests cover what this class decides around it.
 */
class GoogleTokenVerifierImplTest {

    @Mock
    private GoogleIdTokenVerifier googleVerifier;

    private GoogleTokenVerifierImpl verifier;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        verifier = new GoogleTokenVerifierImpl(googleVerifier);
    }

    /** Shaped like an ID token so it parses; nobody checks its signature here, the library is mocked. */
    private static String token(String payloadJson) {
        Base64.Encoder base64 = Base64.getUrlEncoder().withoutPadding();
        String header = base64.encodeToString("{\"alg\":\"RS256\"}".getBytes(StandardCharsets.UTF_8));
        String payload = base64.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
        return header + "." + payload + "." + base64.encodeToString("signature".getBytes(StandardCharsets.UTF_8));
    }

    private static int statusOf(ResponseStatusException e) {
        return e.getStatusCode().value();
    }

    @Test
    void aValidToken_givesTheIdentityWithALowercaseEmail() throws Exception {
        when(googleVerifier.verify(any(GoogleIdToken.class))).thenReturn(true);

        GoogleIdentity identity = verifier.verify(token(
                "{\"sub\":\"1234\",\"email\":\"Ana@Example.COM\",\"email_verified\":true,\"name\":\"Ana Pérez\"}"));

        assertEquals("1234", identity.subject());
        assertEquals("ana@example.com", identity.email());
        assertEquals("Ana Pérez", identity.name());
    }

    @Test
    void aTokenWithoutName_stillGivesTheIdentity() throws Exception {
        when(googleVerifier.verify(any(GoogleIdToken.class))).thenReturn(true);

        GoogleIdentity identity = verifier.verify(token(
                "{\"sub\":\"1234\",\"email\":\"ana@example.com\",\"email_verified\":true}"));

        assertNull(identity.name());
    }

    @Test
    void aTokenTheLibraryRejects_is401() throws Exception {
        when(googleVerifier.verify(any(GoogleIdToken.class))).thenReturn(false);

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> verifier.verify(token(
                "{\"sub\":\"1234\",\"email\":\"ana@example.com\",\"email_verified\":true}")));

        assertEquals(401, statusOf(e));
    }

    @Test
    void somethingThatIsNotAToken_is401() {
        assertEquals(401, statusOf(assertThrows(ResponseStatusException.class, () -> verifier.verify("not-a-token"))));
        assertEquals(401, statusOf(assertThrows(ResponseStatusException.class, () -> verifier.verify("a.b.c"))));
    }

    @Test
    void anUnverifiedEmail_is400() throws Exception {
        when(googleVerifier.verify(any(GoogleIdToken.class))).thenReturn(true);

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> verifier.verify(token(
                "{\"sub\":\"1234\",\"email\":\"ana@example.com\",\"email_verified\":false}")));

        assertEquals(400, statusOf(e));
    }

    @Test
    void aTokenWithoutEmailOrSubject_is401() throws Exception {
        when(googleVerifier.verify(any(GoogleIdToken.class))).thenReturn(true);

        assertEquals(401, statusOf(assertThrows(ResponseStatusException.class,
                () -> verifier.verify(token("{\"sub\":\"1234\",\"email_verified\":true}")))));
        assertEquals(401, statusOf(assertThrows(ResponseStatusException.class,
                () -> verifier.verify(token("{\"email\":\"ana@example.com\",\"email_verified\":true}")))));
    }

    @Test
    void whenGoogleCantBeReached_is503NotAnInvalidToken() throws Exception {
        when(googleVerifier.verify(any(GoogleIdToken.class))).thenThrow(new IOException("certs unreachable"));
        String valid = token("{\"sub\":\"1234\",\"email\":\"ana@example.com\",\"email_verified\":true}");

        assertEquals(503, statusOf(assertThrows(ResponseStatusException.class, () -> verifier.verify(valid))));

        when(googleVerifier.verify(any(GoogleIdToken.class))).thenThrow(new GeneralSecurityException("bad keys"));
        assertEquals(503, statusOf(assertThrows(ResponseStatusException.class, () -> verifier.verify(valid))));
    }

    @Test
    void withoutAClientId_googleSignInIsOffAndAnswers503() {
        for (String clientId : new String[]{"", "  ", null}) {
            GoogleTokenVerifierImpl disabled = new GoogleTokenVerifierImpl(clientId);

            assertEquals(503, statusOf(assertThrows(ResponseStatusException.class,
                    () -> disabled.verify(token("{\"sub\":\"1\",\"email\":\"a@b.co\",\"email_verified\":true}")))));
        }
    }
}
