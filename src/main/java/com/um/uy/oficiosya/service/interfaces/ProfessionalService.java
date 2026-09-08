package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;

import java.util.UUID;

public interface ProfessionalService {
    UserResponse createProfessional(ProfessionalCreateRequest professionalRequest);
    UserResponse updateProfessional(ProfessionalUpdateRequest professionalRequest, UUID id);
    void deleteProfessional(UUID id);
}
