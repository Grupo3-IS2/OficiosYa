package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;

import java.util.UUID;

public interface ProfessionalService {
    ProfessionalResponse createProfessional(ProfessionalCreateRequest professionalRequest);
    ProfessionalResponse updateProfessional(ProfessionalUpdateRequest professionalRequest, UUID id);
    void deleteProfessional(UUID id);
}
