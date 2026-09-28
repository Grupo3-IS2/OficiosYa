package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.config.RequestRateLimiter;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleLinkUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleUnlinkRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;

    private final GoogleAuthService googleAuthService;

    private final RequestRateLimiter rateLimiter;

    /** The endpoints that mail or check an email-change code share this per-client limit. */
    private static final String EMAIL_CHANGE_BUCKET = "email-change";

    public UserController(UserService userService, GoogleAuthService googleAuthService,
                          RequestRateLimiter rateLimiter) {
        this.userService = userService;
        this.googleAuthService = googleAuthService;
        this.rateLimiter = rateLimiter;
    }

    /**
     * The profile of whoever owns the token. A professional answers with a
     * {@link com.um.uy.oficiosya.dto.response.ProfessionalResponse}: the same body plus
     * its phone number and working location.
     */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> getAuthenticatedUser(Authentication authentication) {
        return ResponseEntity.ok(userService.getUser(AuthenticatedUser.id(authentication)));
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
                .body(userService.startEmailChange(emailRequest, AuthenticatedUser.id(authentication)));
    }

    /** The code mailed to the new address ({@code email}); changes the email and answers the updated user. */
    @PostMapping("/me/email/verify")
    public ResponseEntity<UserResponse> verifyEmailChange(@Valid @RequestBody VerifyEmailRequest verifyRequest,
                                                          Authentication authentication,
                                                          HttpServletRequest request) {
        rateLimiter.check(request, EMAIL_CHANGE_BUCKET);
        return ResponseEntity.ok(userService.verifyEmailChange(verifyRequest, AuthenticatedUser.id(authentication)));
    }

    @PostMapping("/me/email/resend")
    public ResponseEntity<PendingVerificationResponse> resendEmailChangeCode(@Valid @RequestBody ResendCodeRequest resendRequest,
                                                                             Authentication authentication,
                                                                             HttpServletRequest request) {
        rateLimiter.check(request, EMAIL_CHANGE_BUCKET);
        return ResponseEntity.accepted()
                .body(userService.resendEmailChangeCode(resendRequest, AuthenticatedUser.id(authentication)));
    }

    @PutMapping("/me/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody PasswordUpdateRequest passwordRequest,
                                               Authentication authentication) {
        userService.changePassword(passwordRequest, AuthenticatedUser.id(authentication));
        return ResponseEntity.noContent().build();
    }

    /** Links a Google account so the user can sign in with it too. Needs the current password. */
    @PutMapping("/me/google")
    public ResponseEntity<UserResponse> linkGoogle(@Valid @RequestBody GoogleLinkUpdateRequest request,
                                                   Authentication authentication) {
        return ResponseEntity.ok(googleAuthService.linkToUser(AuthenticatedUser.id(authentication), request));
    }

    @DeleteMapping("/me/google")
    public ResponseEntity<UserResponse> unlinkGoogle(@Valid @RequestBody GoogleUnlinkRequest request,
                                                     Authentication authentication) {
        return ResponseEntity.ok(googleAuthService.unlinkFromUser(AuthenticatedUser.id(authentication), request));
    }

    @PostMapping(value = "/me/profile-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UserResponse> changeProfileImage(@RequestParam("file") MultipartFile image,
                                                           Authentication authentication) {
        return ResponseEntity.ok(userService.changeProfileImage(image, AuthenticatedUser.id(authentication)));
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteUser(Authentication authentication) {
        userService.deleteUser(AuthenticatedUser.id(authentication));
        return ResponseEntity.noContent().build();
    }

}
