package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleLinkUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleUnlinkRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.UserService;
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

    public UserController(UserService userService, GoogleAuthService googleAuthService) {
        this.userService = userService;
        this.googleAuthService = googleAuthService;
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

    @PutMapping("/me/email")
    public ResponseEntity<UserResponse> changeEmail(@Valid @RequestBody EmailUpdateRequest emailRequest,
                                                    Authentication authentication) {
        return ResponseEntity.ok(userService.changeEmail(emailRequest, AuthenticatedUser.id(authentication)));
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
