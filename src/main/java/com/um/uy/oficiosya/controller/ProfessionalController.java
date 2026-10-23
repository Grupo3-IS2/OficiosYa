package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalSearchFilters;
import com.um.uy.oficiosya.dto.response.PriceRangeResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalPublicResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.response.ReviewResponse;
import com.um.uy.oficiosya.dto.update.ExpertiseTradeUpdateRequest;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/professionals")
public class ProfessionalController {

    private final ProfessionalService professionalService;
    private final JobRequestService jobRequestService;

    public ProfessionalController(ProfessionalService professionalService, JobRequestService jobRequestService) {
        this.professionalService = professionalService;
        this.jobRequestService = jobRequestService;
    }

    /** The caller's full profile, contact data included and whether published or not. */
    @PreAuthorize("hasRole('PROFESSIONAL')")
    @GetMapping("/me")
    public ResponseEntity<ProfessionalResponse> getMyProfile(Authentication authentication) {
        return ResponseEntity.ok(professionalService.getProfessional(AuthenticatedUser.id(authentication)));
    }

    @PreAuthorize("hasRole('PROFESSIONAL')")
    @PatchMapping("/me")
    public ResponseEntity<ProfessionalResponse> updateProfessional(@Valid @RequestBody ProfessionalUpdateRequest professionalRequest,
                                                                   Authentication authentication) {
        ProfessionalResponse professional = professionalService.updateProfessional(professionalRequest, AuthenticatedUser.id(authentication));
        return ResponseEntity.ok(professional);
    }

    /** Public view, without email or phone; not found unless the professional is published. */
    @SecurityRequirements
    @GetMapping("/{id}")
    public ResponseEntity<ProfessionalPublicResponse> getProfessional(@PathVariable UUID id) {
        return ResponseEntity.ok(professionalService.getPublicProfessional(id));
    }

    /**
     * Clients, and the professional on their own profile. The role hierarchy lets professionals pass
     * hasRole('CLIENT'), so other professionals are excluded explicitly.
     */
    @PreAuthorize("(hasRole('CLIENT') and !hasRole('PROFESSIONAL')) or #id.toString() == authentication.name")
    @GetMapping("/{id}/reviews")
    public ResponseEntity<Page<ReviewResponse>> getProfessionalReviews(@PathVariable UUID id,
                                                                       @ParameterObject @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(jobRequestService.getProfessionalReviews(id, pageable));
    }

    /**
     * Published professionals only; every filter is optional and combinable. tradeIds, minPrice
     * and maxPrice are matched against the same offered trade. Paginated:
     * ?page=&size=&sort=field,asc|desc.
     */
    @SecurityRequirements
    @GetMapping("/search")
    public ResponseEntity<Page<ProfessionalPublicResponse>> searchProfessionals(
            @RequestParam(required = false) List<Long> tradeIds,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Double minRating,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime availableFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime availableTo,
            @RequestParam(required = false) ProfessionalSearchFilters.Order order,
            @ParameterObject @PageableDefault(size = 20) Pageable pageable) {
        ProfessionalSearchFilters filters = new ProfessionalSearchFilters(tradeIds, minPrice, maxPrice, minRating,
                location, query, availableFrom, availableTo, order);
        return ResponseEntity.ok(professionalService.searchProfessionals(filters, pageable));
    }

    /** The lowest and highest hourly rates on offer, for those trades (all if none) and that name. */
    @GetMapping("/search/price-range")
    public ResponseEntity<PriceRangeResponse> priceRange(@RequestParam(required = false) List<Long> tradeIds,
                                                         @RequestParam(required = false) String query) {
        return ResponseEntity.ok(professionalService.priceRange(tradeIds, query));
    }

    /** Requires a description and at least one offered trade already set. */
    @PreAuthorize("hasRole('PROFESSIONAL')")
    @PostMapping("/me/publish")
    public ResponseEntity<ProfessionalResponse> publishProfessional(Authentication authentication) {
        return ResponseEntity.ok(professionalService.publishProfessional(AuthenticatedUser.id(authentication)));
    }

    /** Takes the profile off client-facing search and lookups. */
    @PreAuthorize("hasRole('PROFESSIONAL')")
    @PostMapping("/me/unpublish")
    public ResponseEntity<ProfessionalResponse> unpublishProfessional(Authentication authentication) {
        return ResponseEntity.ok(professionalService.unpublishProfessional(AuthenticatedUser.id(authentication)));
    }

    /** Declares a trade the professional offers and at what hourly rate. */
    @PreAuthorize("hasRole('PROFESSIONAL')")
    @PostMapping("/me/expertise-trades")
    public ResponseEntity<ProfessionalResponse> addExpertiseTrade(@Valid @RequestBody ExpertiseTradeCreateRequest request,
                                                                    Authentication authentication) {
        return new ResponseEntity<>(professionalService.addExpertiseTrade(AuthenticatedUser.id(authentication), request), HttpStatus.CREATED);
    }

    /** Changes the hourly rates of a trade the professional already offers. */
    @PreAuthorize("hasRole('PROFESSIONAL')")
    @PatchMapping("/me/expertise-trades/{expertiseTradeId}")
    public ResponseEntity<ProfessionalResponse> updateExpertiseTrade(@PathVariable Long expertiseTradeId,
                                                                       @Valid @RequestBody ExpertiseTradeUpdateRequest request,
                                                                       Authentication authentication) {
        return ResponseEntity.ok(professionalService.updateExpertiseTrade(AuthenticatedUser.id(authentication), expertiseTradeId, request));
    }

    @PreAuthorize("hasRole('PROFESSIONAL')")
    @DeleteMapping("/me/expertise-trades/{expertiseTradeId}")
    public ResponseEntity<ProfessionalResponse> removeExpertiseTrade(@PathVariable Long expertiseTradeId,
                                                                        Authentication authentication) {
        return ResponseEntity.ok(professionalService.removeExpertiseTrade(AuthenticatedUser.id(authentication), expertiseTradeId));
    }

}
