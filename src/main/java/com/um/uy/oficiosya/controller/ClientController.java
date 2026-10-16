package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.config.RefreshTokenCookie;
import com.um.uy.oficiosya.config.RequestRateLimiter;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.ClientResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleLinkUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleUnlinkRequest;
import com.um.uy.oficiosya.dto.update.NotificationsUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.dto.update.ClientUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/users")
public class ClientController {

    private final ClientService clientService;

    private final GoogleAuthService googleAuthService;

    private final RequestRateLimiter rateLimiter;

    private final AuthService authService;

    private final RefreshTokenCookie refreshTokenCookie;

    /** The endpoints that mail or check an email-change code share this per-client limit. */
    private static final String EMAIL_CHANGE_BUCKET = "email-change";
    private static final String PASSWORD_SETUP_BUCKET = "password-setup";
    private static final String ACCOUNT_DELETION_BUCKET = "account-deletion";

    public ClientController(ClientService clientService, GoogleAuthService googleAuthService,
                            RequestRateLimiter rateLimiter, AuthService authService,
                            RefreshTokenCookie refreshTokenCookie) {
        this.clientService = clientService;
        this.googleAuthService = googleAuthService;
        this.rateLimiter = rateLimiter;
        this.authService = authService;
        this.refreshTokenCookie = refreshTokenCookie;
    }

    /**
     * The profile of whoever owns the token. A professional answers with a
     * {@link com.um.uy.oficiosya.dto.response.ProfessionalResponse}: the same body plus
     * its phone number and working location.
     */
    @GetMapping("/me")
    public ResponseEntity<ClientResponse> getAuthenticatedUser(Authentication authentication) {
        return ResponseEntity.ok(clientService.getUser(AuthenticatedUser.id(authentication)));
    }

    /** The fields every account has (the name). A professional's own fields go through /professionals/me. */
    @PatchMapping("/me")
    public ResponseEntity<ClientResponse> updateUser(@Valid @RequestBody ClientUpdateRequest userRequest,
                                                     Authentication authentication) {
        return ResponseEntity.ok(clientService.updateUser(userRequest, AuthenticatedUser.id(authentication)));
    }

    /**
     * Starts changing the email: mails a code to the new address and answers 202. The email
     * only changes once {@code /me/email/verify} gets that code.
     */
    @PutMapping("/me/email")
    public ResponseEntity<PendingVerificationResponse> changeEmail(@Valid @RequestBody EmailUpdateRequest emailRequest,
                                                                   Authentication authentication,
                                                                   HttpServletRequest request) {
        rateLimiter.check(request, EMAIL_CHANGE_BUCKET);
        return ResponseEntity.accepted()
                .body(clientService.startEmailChange(emailRequest, AuthenticatedUser.id(authentication)));
    }

    /** The code mailed to the new address ({@code email}); changes the email and answers the updated user. */
    @PostMapping("/me/email/verify")
    public ResponseEntity<ClientResponse> verifyEmailChange(@Valid @RequestBody VerifyEmailRequest verifyRequest,
                                                            Authentication authentication,
                                                            HttpServletRequest request) {
        rateLimiter.check(request, EMAIL_CHANGE_BUCKET);
        return ResponseEntity.ok(clientService.verifyEmailChange(verifyRequest, AuthenticatedUser.id(authentication)));
    }

    @PostMapping("/me/email/resend")
    public ResponseEntity<PendingVerificationResponse> resendEmailChangeCode(@Valid @RequestBody ResendCodeRequest resendRequest,
                                                                             Authentication authentication,
                                                                             HttpServletRequest request) {
        rateLimiter.check(request, EMAIL_CHANGE_BUCKET);
        return ResponseEntity.accepted()
                .body(clientService.resendEmailChangeCode(resendRequest, AuthenticatedUser.id(authentication)));
    }

    /**
     * Also logs the user out of every other device. This one gets a new refresh token cookie: its
     * access token stops working too, and the next request renews it with that cookie.
     */
    @PutMapping("/me/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody PasswordUpdateRequest passwordRequest,
                                               Authentication authentication) {
        clientService.changePassword(passwordRequest, AuthenticatedUser.id(authentication));
        String refreshToken = authService.restartSessions(AuthenticatedUser.id(authentication));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie.create(refreshToken).toString())
                .build();
    }

    /** Turns the emails about the user's requests on or off: a change of timeframe asked of them, requests piling up. */
    @PutMapping("/me/notifications")
    public ResponseEntity<ClientResponse> updateNotifications(@Valid @RequestBody NotificationsUpdateRequest request,
                                                              Authentication authentication) {
        return ResponseEntity.ok(clientService.updateNotifications(request, AuthenticatedUser.id(authentication)));
    }

    /** Links a Google account so the user can sign in with it too. Needs the current password. */
    @PutMapping("/me/google")
    public ResponseEntity<ClientResponse> linkGoogle(@Valid @RequestBody GoogleLinkUpdateRequest request,
                                                     Authentication authentication) {
        return ResponseEntity.ok(googleAuthService.linkToUser(AuthenticatedUser.id(authentication), request));
    }

    @DeleteMapping("/me/google")
    public ResponseEntity<ClientResponse> unlinkGoogle(@Valid @RequestBody GoogleUnlinkRequest request,
                                                       Authentication authentication) {
        return ResponseEntity.ok(googleAuthService.unlinkFromUser(AuthenticatedUser.id(authentication), request));
    }

    @PostMapping(value = "/me/profile-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ClientResponse> changeProfileImage(@RequestParam("file") MultipartFile image,
                                                             Authentication authentication) {
        return ResponseEntity.ok(clientService.changeProfileImage(image, AuthenticatedUser.id(authentication)));
    }

    /** Back to no photo. */
    @DeleteMapping("/me/profile-image")
    public ResponseEntity<ClientResponse> removeProfileImage(Authentication authentication) {
        return ResponseEntity.ok(clientService.removeProfileImage(AuthenticatedUser.id(authentication)));
    }

    /** Mails the code that deleting the account asks for; asking again resends it. */
    @PostMapping("/me/deletion-code")
    public ResponseEntity<PendingVerificationResponse> startAccountDeletion(Authentication authentication,
                                                                            HttpServletRequest request) {
        rateLimiter.check(request, ACCOUNT_DELETION_BUCKET);
        return ResponseEntity.accepted().body(clientService.startAccountDeletion(AuthenticatedUser.id(authentication)));
    }

    /**
     * Deletes the account (see {@link ClientService#deleteUser}), confirmed with the password or, for
     * an account created with Google, its email, and the code mailed to it. Every session ends, this one's
     * cookie too.
     */
    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteUser(@RequestBody AccountDeletionRequest deletionRequest, Authentication authentication,
                                           HttpServletRequest request) {
        rateLimiter.check(request, ACCOUNT_DELETION_BUCKET);
        clientService.deleteUser(deletionRequest, AuthenticatedUser.id(authentication));
        authService.endSessions(AuthenticatedUser.id(authentication));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie.clear().toString())
                .build();
    }

}
