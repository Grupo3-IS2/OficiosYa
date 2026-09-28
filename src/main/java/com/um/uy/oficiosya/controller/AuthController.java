package com.um.uy.oficiosya.controller;

import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import com.um.uy.oficiosya.config.RequestRateLimiter;
import com.um.uy.oficiosya.dto.request.GoogleCredentialRequest;
import com.um.uy.oficiosya.dto.request.GoogleLinkRequest;
import com.um.uy.oficiosya.dto.request.GoogleProfessionalRegisterRequest;
import com.um.uy.oficiosya.dto.request.LoginRequest;
import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.TokenResponse;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.RegistrationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Every auth endpoint is public **/
@SecurityRequirements
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    /** Every endpoint that mails a code or checks one shares this per-client limit. */
    private static final String REGISTRATION_BUCKET = "registration";

    /** Same idea for Google sign-in, where {@code /google/link} is also a password check. */
    private static final String GOOGLE_BUCKET = "google";

    private final AuthService authService;

    private final RegistrationService registrationService;

    private final GoogleAuthService googleAuthService;

    private final RequestRateLimiter rateLimiter;

    public AuthController(AuthService authService, RegistrationService registrationService,
                          GoogleAuthService googleAuthService, RequestRateLimiter rateLimiter) {
        this.authService = authService;
        this.registrationService = registrationService;
        this.googleAuthService = googleAuthService;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest dto){
        LoginResponse response = authService.login(dto);
        return ResponseEntity.ok(response);
    }

    /** Doesn't create the account: it mails a code that {@code /verify-email} has to receive. */
    @PostMapping("/register-client")
    public ResponseEntity<PendingVerificationResponse> registerClient(
            @Valid @RequestBody ClientCreateRequest dto, HttpServletRequest request){
        rateLimiter.check(request, REGISTRATION_BUCKET);
        return ResponseEntity.accepted().body(registrationService.startRegistration(dto));
    }

    /** Same as {@code /register-client}, for a professional. */
    @PostMapping("/register-professional")
    public ResponseEntity<PendingVerificationResponse> registerProfessional(
            @Valid @RequestBody ProfessionalCreateRequest dto, HttpServletRequest request){
        rateLimiter.check(request, REGISTRATION_BUCKET);
        return ResponseEntity.accepted().body(registrationService.startRegistration(dto));
    }

    /** Checks the code mailed on registration, creates the account and logs the user in. */
    @PostMapping("/verify-email")
    public ResponseEntity<LoginResponse> verifyEmail(
            @Valid @RequestBody VerifyEmailRequest dto, HttpServletRequest request){
        rateLimiter.check(request, REGISTRATION_BUCKET);
        return ResponseEntity.ok(registrationService.verifyEmail(dto));
    }

    @PostMapping("/resend-code")
    public ResponseEntity<PendingVerificationResponse> resendCode(
            @Valid @RequestBody ResendCodeRequest dto, HttpServletRequest request){
        rateLimiter.check(request, REGISTRATION_BUCKET);
        return ResponseEntity.accepted().body(registrationService.resendCode(dto));
    }

    /**
     * Logs in with the ID token from the Google button. 404 if there is no account for that
     * email, 409 if there is one with a password that isn't linked yet ({@code /google/link}).
     */
    @PostMapping("/google/login")
    public ResponseEntity<LoginResponse> googleLogin(
            @Valid @RequestBody GoogleCredentialRequest dto, HttpServletRequest request){
        rateLimiter.check(request, GOOGLE_BUCKET);
        return ResponseEntity.ok(googleAuthService.login(dto));
    }

    /** The user's yes to linking Google to their existing account: confirms the account's password. */
    @PostMapping("/google/link")
    public ResponseEntity<LoginResponse> googleLink(
            @Valid @RequestBody GoogleLinkRequest dto, HttpServletRequest request){
        rateLimiter.check(request, GOOGLE_BUCKET);
        return ResponseEntity.ok(googleAuthService.link(dto));
    }

    @PostMapping("/google/register-client")
    public ResponseEntity<LoginResponse> googleRegisterClient(
            @Valid @RequestBody GoogleCredentialRequest dto, HttpServletRequest request){
        rateLimiter.check(request, GOOGLE_BUCKET);
        return ResponseEntity.ok(googleAuthService.registerClient(dto));
    }

    @PostMapping("/google/register-professional")
    public ResponseEntity<LoginResponse> googleRegisterProfessional(
            @Valid @RequestBody GoogleProfessionalRegisterRequest dto, HttpServletRequest request){
        rateLimiter.check(request, GOOGLE_BUCKET);
        return ResponseEntity.ok(googleAuthService.registerProfessional(dto));
    }

    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(HttpServletRequest request){
        return ResponseEntity.ok(authService.logout(request));
    }

    @GetMapping("/verify")
    public ResponseEntity<TokenResponse> verify(HttpServletRequest request){
        return ResponseEntity.ok(authService.verifyUser(request));
    }
}
