package com.um.uy.oficiosya.controller;

import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import com.um.uy.oficiosya.config.RefreshTokenCookie;
import com.um.uy.oficiosya.config.RequestRateLimiter;
import com.um.uy.oficiosya.dto.request.GoogleCredentialRequest;
import com.um.uy.oficiosya.dto.request.GoogleLinkRequest;
import com.um.uy.oficiosya.dto.request.GoogleProfessionalRegisterRequest;
import com.um.uy.oficiosya.dto.request.GoogleRegisterRequest;
import com.um.uy.oficiosya.dto.request.LoginRequest;
import com.um.uy.oficiosya.dto.request.PasswordResetRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.RegistrationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Every auth endpoint is public. The ones that log the user in answer the access token in the body
 * and set the refresh token cookie ({@link RefreshTokenCookie}), which {@code /refresh} exchanges
 * for a new access token once it expires.
 **/
@SecurityRequirements
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    /** Every endpoint that mails a code or checks one shares this per-client limit. */
    private static final String REGISTRATION_BUCKET = "registration";

    /** Same idea for Google sign-in, where {@code /google/link} is also a password check. */
    private static final String GOOGLE_BUCKET = "google";

    /** Asking for a reset code and using it: the code's own attempt limit holds per email, this per client. */
    private static final String PASSWORD_RESET_BUCKET = "password-reset";

    private final AuthService authService;

    private final RegistrationService registrationService;

    private final GoogleAuthService googleAuthService;

    private final ClientService clientService;

    private final RequestRateLimiter rateLimiter;

    private final RefreshTokenCookie refreshTokenCookie;

    public AuthController(AuthService authService, RegistrationService registrationService,
                          GoogleAuthService googleAuthService, ClientService clientService,
                          RequestRateLimiter rateLimiter, RefreshTokenCookie refreshTokenCookie) {
        this.authService = authService;
        this.registrationService = registrationService;
        this.googleAuthService = googleAuthService;
        this.clientService = clientService;
        this.rateLimiter = rateLimiter;
        this.refreshTokenCookie = refreshTokenCookie;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest dto, HttpServletRequest request){
        rateLimiter.check(request, RequestRateLimiter.LOGIN_BUCKET);
        return this.withSession(authService.login(dto));
    }

    /** Doesn't create the account: it mails a code that {@code /verify-email} has to receive. */
    @PostMapping("/register-client")
    public ResponseEntity<PendingVerificationResponse> registerClient(
            @Valid @RequestBody ClientCreateRequest dto, HttpServletRequest request){
        rateLimiter.check(request, REGISTRATION_BUCKET);
        return this.pendingVerification(registrationService.startRegistration(dto));
    }

    /** Same as {@code /register-client}, for a professional. */
    @PostMapping("/register-professional")
    public ResponseEntity<PendingVerificationResponse> registerProfessional(
            @Valid @RequestBody ProfessionalCreateRequest dto, HttpServletRequest request){
        rateLimiter.check(request, REGISTRATION_BUCKET);
        return this.pendingVerification(registrationService.startRegistration(dto));
    }

    /** Checks the code mailed on registration, creates the account and logs the user in. */
    @PostMapping("/verify-email")
    public ResponseEntity<LoginResponse> verifyEmail(
            @Valid @RequestBody VerifyEmailRequest dto, HttpServletRequest request){
        rateLimiter.check(request, REGISTRATION_BUCKET);
        return this.withSession(registrationService.verifyEmail(dto));
    }

    @PostMapping("/resend-code")
    public ResponseEntity<PendingVerificationResponse> resendCode(
            @Valid @RequestBody ResendCodeRequest dto, HttpServletRequest request){
        rateLimiter.check(request, REGISTRATION_BUCKET);
        return ResponseEntity.accepted().body(registrationService.resendCode(dto));
    }

    /**
     * "Forgot my password": always the same 202, whether the email has an account or not. The code
     * is mailed in the background, so how long it takes doesn't tell either. Asking again is the resend.
     */
    @PostMapping("/password-reset")
    public ResponseEntity<PendingVerificationResponse> startPasswordReset(
            @Valid @RequestBody ResendCodeRequest dto, HttpServletRequest request){
        rateLimiter.check(request, PASSWORD_RESET_BUCKET);
        clientService.startPasswordReset(dto.getEmail());
        return ResponseEntity.accepted().body(clientService.passwordResetPending(dto.getEmail()));
    }

    /**
     * The mailed code and the new password. Every session of the account ends, on every device, and
     * nobody is logged in: whoever reset it signs in with the new password.
     */
    @PostMapping("/password-reset/confirm")
    public ResponseEntity<MessageResponse> completePasswordReset(
            @Valid @RequestBody PasswordResetRequest dto, HttpServletRequest request){
        rateLimiter.check(request, PASSWORD_RESET_BUCKET);
        authService.endSessions(clientService.completePasswordReset(dto));
        return ResponseEntity.ok(new MessageResponse("Listo, cambiaste tu contraseña. Ya podés iniciar sesión con ella."));
    }

    /**
     * Logs in with the ID token from the Google button. 404 if there is no account for that
     * email, 409 if there is one with a password that isn't linked yet ({@code /google/link}).
     */
    @PostMapping("/google/login")
    public ResponseEntity<LoginResponse> googleLogin(
            @Valid @RequestBody GoogleCredentialRequest dto, HttpServletRequest request){
        rateLimiter.check(request, GOOGLE_BUCKET);
        return this.withSession(googleAuthService.login(dto));
    }

    /** The user's yes to linking Google to their existing account: confirms the account's password. */
    @PostMapping("/google/link")
    public ResponseEntity<LoginResponse> googleLink(
            @Valid @RequestBody GoogleLinkRequest dto, HttpServletRequest request){
        rateLimiter.check(request, GOOGLE_BUCKET);
        return this.withSession(googleAuthService.link(dto));
    }

    @PostMapping("/google/register-client")
    public ResponseEntity<LoginResponse> googleRegisterClient(
            @Valid @RequestBody GoogleRegisterRequest dto, HttpServletRequest request){
        rateLimiter.check(request, GOOGLE_BUCKET);
        return this.withSession(googleAuthService.registerClient(dto));
    }

    @PostMapping("/google/register-professional")
    public ResponseEntity<LoginResponse> googleRegisterProfessional(
            @Valid @RequestBody GoogleProfessionalRegisterRequest dto, HttpServletRequest request){
        rateLimiter.check(request, GOOGLE_BUCKET);
        return this.withSession(googleAuthService.registerProfessional(dto));
    }

    /**
     * A new access token for the refresh token cookie, which is rotated too: the cookie in the
     * response replaces it. Without a valid one it is a 401 and the cookie is dropped.
     */
    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(
            @CookieValue(name = RefreshTokenCookie.NAME, required = false) String refreshToken,
            HttpServletResponse response){
        try {
            AuthService.RefreshedLogin refreshed = authService.refresh(refreshToken);
            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, refreshTokenCookie.create(refreshed.refreshToken()).toString())
                    .body(refreshed.login());
        } catch (ResponseStatusException e) {
            // The error body is still written by GlobalExceptionHandler; this only drops the dead cookie
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                response.addHeader(HttpHeaders.SET_COOKIE, refreshTokenCookie.clear().toString());
            }
            throw e;
        }
    }

    /** Works with the access token, the refresh token cookie or both, and always drops the cookie. */
    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(HttpServletRequest request,
            @CookieValue(name = RefreshTokenCookie.NAME, required = false) String refreshToken){
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie.clear().toString())
                .body(authService.logout(request, refreshToken));
    }

    @GetMapping("/verify")
    public ResponseEntity<TokenResponse> verify(HttpServletRequest request){
        return ResponseEntity.ok(authService.verifyUser(request));
    }

    private ResponseEntity<LoginResponse> withSession(LoginResponse login) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, this.sessionCookie(login))
                .body(login);
    }

    /** With verification off the account is created right away, and comes back already logged in. */
    private ResponseEntity<PendingVerificationResponse> pendingVerification(PendingVerificationResponse pending) {
        ResponseEntity.BodyBuilder response = ResponseEntity.accepted();
        if (pending.getSession() != null) {
            response.header(HttpHeaders.SET_COOKIE, this.sessionCookie(pending.getSession()));
        }
        return response.body(pending);
    }

    private String sessionCookie(LoginResponse login) {
        return refreshTokenCookie.create(authService.startSession(login.getId())).toString();
    }
}
