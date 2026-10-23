package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalSearchFilters;
import com.um.uy.oficiosya.dto.response.PriceRangeResponse;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.ProfessionalPublicResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.update.ExpertiseTradeUpdateRequest;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.UUID;

public interface ProfessionalService {
    ProfessionalResponse createProfessional(ProfessionalCreateRequest professionalRequest);

    /**
     * Creates the professional with a password that is already hashed; the request's own password
     * is ignored. For accounts whose data was validated and hashed earlier (a verified registration).
     */
    ProfessionalResponse createProfessional(ProfessionalCreateRequest professionalRequest, String encodedPassword);
    ProfessionalResponse updateProfessional(ProfessionalUpdateRequest professionalRequest, UUID id);
    /** The full profile, contact data included: only for the owner and admins. */
    ProfessionalResponse getProfessional(UUID id);

    /** The public view of a professional; not found unless published or the viewer is the owner or an admin. */
    ProfessionalPublicResponse getPublicProfessional(UUID id, boolean ownerOrAdmin);
    void deleteProfessional(UUID id);

    /** Admin-only. */
    List<ProfessionalResponse> listProfessionals();

    /** Requires a description and at least one offered trade already set. */
    ProfessionalResponse publishProfessional(UUID id);
    ProfessionalResponse unpublishProfessional(UUID id);

    ProfessionalResponse addExpertiseTrade(UUID professionalId, ExpertiseTradeCreateRequest request);
    ProfessionalResponse updateExpertiseTrade(UUID professionalId, Long expertiseTradeId, ExpertiseTradeUpdateRequest request);
    ProfessionalResponse removeExpertiseTrade(UUID professionalId, Long expertiseTradeId);

    /**
     * Published professionals only, a page at a time; every filter is optional and combinable.
     * tradeIds, minPrice and maxPrice are matched against the same offered trade. The order comes
     * in the filters: a sort in the Pageable is ignored.
     */
    Page<ProfessionalPublicResponse> searchProfessionals(ProfessionalSearchFilters filters, Pageable pageable);

    /** The hourly rates on offer, to bound the price filter: of those trades (all if none) and that name. */
    PriceRangeResponse priceRange(List<Long> tradeIds, String query);
}
