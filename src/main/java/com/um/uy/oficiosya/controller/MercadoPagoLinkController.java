package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.service.MercadoPagoAccountLink;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** A professional links the Mercado Pago account they are paid into by logging in to it. */
@RestController
public class MercadoPagoLinkController {

    private final MercadoPagoAccountLink accountLink;

    public MercadoPagoLinkController(MercadoPagoAccountLink accountLink) {
        this.accountLink = accountLink;
    }

    /** Whether linking is on: without MP_CLIENT_ID / MP_CLIENT_SECRET the account is typed and paid out by hand. */
    @PreAuthorize("hasRole('PROFESSIONAL')")
    @GetMapping("/api/v1/professionals/me/mercado-pago")
    public ResponseEntity<Map<String, Boolean>> linkAvailability() {
        return ResponseEntity.ok(Map.of("available", accountLink.isEnabled()));
    }

    /** Where to send the browser to authorize OficiosYa; 503 while MP_CLIENT_ID / MP_CLIENT_SECRET aren't set. */
    @PreAuthorize("hasRole('PROFESSIONAL')")
    @PostMapping("/api/v1/professionals/me/mercado-pago")
    public ResponseEntity<Map<String, String>> startLink(Authentication authentication) {
        return ResponseEntity.ok(Map.of("authorizationUrl", accountLink.authorizationUrl(AuthenticatedUser.id(authentication))));
    }

    /** Stops charging into the linked account; 409 while an open job's payment depends on it. */
    @PreAuthorize("hasRole('PROFESSIONAL')")
    @DeleteMapping("/api/v1/professionals/me/mercado-pago")
    public ResponseEntity<Void> unlink(Authentication authentication) {
        accountLink.unlink(AuthenticatedUser.id(authentication));
        return ResponseEntity.noContent().build();
    }

    /** Mercado Pago brings the browser back here (public: the signed state says who it is for), then to the profile. */
    @GetMapping("/api/v1/payments/mercado-pago/callback")
    public ResponseEntity<Void> callback(@RequestParam(required = false) String code,
                                         @RequestParam(required = false) String state,
                                         @RequestParam(required = false) String error) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, accountLink.finish(code, state, error))
                .build();
    }
}
