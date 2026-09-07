package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/user")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    /** The profile of whoever owns the token*/
    @GetMapping("/me")
    public ResponseEntity<UserResponse> getAuthenticatedUser(Authentication authentication) {
        return ResponseEntity.ok(userService.getUser(authenticatedUserId(authentication)));
    }

    @PutMapping("/me/email")
    public ResponseEntity<UserResponse> changeEmail(@Valid @RequestBody EmailUpdateRequest emailRequest,
                                                    Authentication authentication) {
        return ResponseEntity.ok(userService.changeEmail(emailRequest, authenticatedUserId(authentication)));
    }

    @PutMapping("/me/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody PasswordUpdateRequest passwordRequest,
                                               Authentication authentication) {
        userService.changePassword(passwordRequest, authenticatedUserId(authentication));
        return ResponseEntity.noContent().build();
    }
    
    @PreAuthorize("#id.toString().equals(authentication.name)")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable UUID id) {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

    private UUID authenticatedUserId(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }

        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid authentication token");
        }
    }

}
