package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.ProfessionalPublicResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.update.ExpertiseTradeUpdateRequest;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
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

    /** The public view of a professional; not found unless the professional is published. */
    ProfessionalPublicResponse getPublicProfessional(UUID id);
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
     * Published professionals only; every filter is optional and combinable. tradeIds, minPrice
     * and maxPrice are matched against the same offered trade.
     */
    Page<ProfessionalPublicResponse> searchProfessionals(List<Long> tradeIds, BigDecimal minPrice, BigDecimal maxPrice,
                                                    Double minRating, String location, String query, Pageable pageable);
}
