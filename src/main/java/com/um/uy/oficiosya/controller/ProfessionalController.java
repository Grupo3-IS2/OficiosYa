package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/professional")
public class ProfessionalController {

    private final ProfessionalService professionalService;

    public ProfessionalController(ProfessionalService professionalService) {
        this.professionalService = professionalService;
    }

    @PostMapping("/create")
    public ResponseEntity<UserResponse> createProfessional(@Valid @RequestBody ProfessionalCreateRequest professionalRequest) {
        UserResponse professional = professionalService.createProfessional(professionalRequest);
        return new ResponseEntity<>(professional, HttpStatus.CREATED);
    }

    /** Only the owner of the account: the JWT subject is the user's publicId. */
    @PreAuthorize("#id.toString().equals(authentication.name)")
    @PutMapping("/{id}")
    public ResponseEntity<UserResponse> updateProfessional(@Valid @RequestBody ProfessionalUpdateRequest professionalRequest, @PathVariable UUID id) {
        UserResponse professional = professionalService.updateProfessional(professionalRequest, id);
        return ResponseEntity.ok(professional);
    }

}
