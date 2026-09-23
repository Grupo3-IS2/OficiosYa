package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.ClientUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/client")
public class ClientController {

    private final ClientService clientService;

    public ClientController(ClientService clientService) {
        this.clientService = clientService;
    }

    @PreAuthorize("hasRole('CLIENT')")
    @PutMapping("/me")
    public ResponseEntity<UserResponse> updateClient(@Valid @RequestBody ClientUpdateRequest clientRequest,
                                                     Authentication authentication) {
        UserResponse client = clientService.updateClient(clientRequest, AuthenticatedUser.id(authentication));
        return ResponseEntity.ok(client);
    }

}
