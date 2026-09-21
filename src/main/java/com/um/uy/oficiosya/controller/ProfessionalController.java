package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.config.ViewerAccess;
import com.um.uy.oficiosya.dto.response.ProfessionalPublicResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/professional")
public class ProfessionalController {

    private final ProfessionalService professionalService;

    public ProfessionalController(ProfessionalService professionalService) {
        this.professionalService = professionalService;
    }

    @PostMapping("/create")
    public ResponseEntity<ProfessionalResponse> createProfessional(@Valid @RequestBody ProfessionalCreateRequest professionalRequest) {
        ProfessionalResponse professional = professionalService.createProfessional(professionalRequest);
        return new ResponseEntity<>(professional, HttpStatus.CREATED);
    }

    /** Only the owner of the account: the JWT subject is the user's publicId. */
    @PreAuthorize("#id.toString().equals(authentication.name)")
    @PutMapping("/{id}")
    public ResponseEntity<ProfessionalResponse> updateProfessional(@Valid @RequestBody ProfessionalUpdateRequest professionalRequest, @PathVariable UUID id) {
        ProfessionalResponse professional = professionalService.updateProfessional(professionalRequest, id);
        return ResponseEntity.ok(professional);
    }

    /**
     * Public. The owner and admins get the full profile (email and phone included, published or
     * not); everyone else gets the public view, and only if the professional is published.
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getProfessional(@PathVariable UUID id, Authentication authentication) {
        if (ViewerAccess.isOwnerOrAdmin(authentication, id)) {
            return ResponseEntity.ok(professionalService.getProfessional(id));
        }
        return ResponseEntity.ok(professionalService.getPublicProfessional(id));
    }

    /**
     * Published professionals only; every filter is optional and combinable. tradeIds, minPrice
     * and maxPrice are matched against the same offered trade. Paginated:
     * ?page=&size=&sort=field,asc|desc.
     */
    @GetMapping("/search")
    public ResponseEntity<Page<ProfessionalPublicResponse>> searchProfessionals(
            @RequestParam(required = false) List<Long> tradeIds,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Double minRating,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) String query,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
                professionalService.searchProfessionals(tradeIds, minPrice, maxPrice, minRating, location, query, pageable));
    }

    /** Only the owner; requires a description and at least one offered trade already set. */
    @PreAuthorize("#id.toString().equals(authentication.name)")
    @PostMapping("/{id}/publish")
    public ResponseEntity<ProfessionalResponse> publishProfessional(@PathVariable UUID id) {
        return ResponseEntity.ok(professionalService.publishProfessional(id));
    }

    /** Only the owner: takes the profile off client-facing search and lookups. */
    @PreAuthorize("#id.toString().equals(authentication.name)")
    @PostMapping("/{id}/unpublish")
    public ResponseEntity<ProfessionalResponse> unpublishProfessional(@PathVariable UUID id) {
        return ResponseEntity.ok(professionalService.unpublishProfessional(id));
    }

    /** Only the owner can declare which trades they offer and at what hourly rate. */
    @PreAuthorize("#id.toString().equals(authentication.name)")
    @PostMapping("/{id}/expertise-trade")
    public ResponseEntity<ProfessionalResponse> addExpertiseTrade(@PathVariable UUID id,
                                                                    @Valid @RequestBody ExpertiseTradeCreateRequest request) {
        return new ResponseEntity<>(professionalService.addExpertiseTrade(id, request), HttpStatus.CREATED);
    }

    @PreAuthorize("#id.toString().equals(authentication.name)")
    @DeleteMapping("/{id}/expertise-trade/{expertiseTradeId}")
    public ResponseEntity<ProfessionalResponse> removeExpertiseTrade(@PathVariable UUID id,
                                                                        @PathVariable Long expertiseTradeId) {
        return ResponseEntity.ok(professionalService.removeExpertiseTrade(id, expertiseTradeId));
    }

}
