package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.ClientUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/client")
public class ClientController {

    private final ClientService clientService;

    public ClientController(ClientService clientService) {
        this.clientService = clientService;
    }

    @PostMapping("/create")
    public ResponseEntity<UserResponse> createClient(@Valid @RequestBody ClientCreateRequest clientRequest) {
        UserResponse client = clientService.createClient(clientRequest);
        return new ResponseEntity<>(client, HttpStatus.CREATED);
    }

    /** Only the owner of the account: the JWT subject is the user's publicId. */
    @PreAuthorize("#id.toString().equals(authentication.name)")
    @PutMapping("/{id}")
    public ResponseEntity<UserResponse> updateClient(@Valid @RequestBody ClientUpdateRequest clientRequest, @PathVariable UUID id) {
        UserResponse client = clientService.updateClient(clientRequest, id);
        return ResponseEntity.ok(client);
    }

}
