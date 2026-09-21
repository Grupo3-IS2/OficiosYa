package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public interface ProfessionalService {
    ProfessionalResponse createProfessional(ProfessionalCreateRequest professionalRequest);
    ProfessionalResponse updateProfessional(ProfessionalUpdateRequest professionalRequest, UUID id);
    ProfessionalResponse getProfessional(UUID id);
    void deleteProfessional(UUID id);

    /** Admin-only. */
    List<ProfessionalResponse> listProfessionals();

    /** Admin-only: sets the professional's overall rating directly. */
    ProfessionalResponse updateRating(UUID professionalId, Double rating);

    /** Requires a description and at least one offered trade already set. */
    ProfessionalResponse publishProfessional(UUID id);
    ProfessionalResponse unpublishProfessional(UUID id);

    ProfessionalResponse addExpertiseTrade(UUID professionalId, ExpertiseTradeCreateRequest request);
    ProfessionalResponse removeExpertiseTrade(UUID professionalId, Long expertiseTradeId);

    /**
     * Published professionals only; every filter is optional and combinable. tradeIds, minPrice
     * and maxPrice are matched against the same offered trade.
     */
    Page<ProfessionalResponse> searchProfessionals(List<Long> tradeIds, BigDecimal minPrice, BigDecimal maxPrice,
                                                    Double minRating, String location, String query, Pageable pageable);
}
