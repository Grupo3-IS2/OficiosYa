package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.ProfessionalMapper;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class ProfessionalServiceImpl implements ProfessionalService {

    private final ProfessionalRepository professionalRepository;
    private final UserRepository userRepository;
    private final ProfessionalMapper professionalMapper;
    private final PasswordEncoder passwordEncoder;

    public ProfessionalServiceImpl(ProfessionalRepository professionalRepository,
                                   UserRepository userRepository,
                                   ProfessionalMapper professionalMapper,
                                   PasswordEncoder passwordEncoder) {
        this.professionalRepository = professionalRepository;
        this.userRepository = userRepository;
        this.professionalMapper = professionalMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public UserResponse createProfessional(ProfessionalCreateRequest professionalRequest) {
        if (this.userRepository.existsByEmail(professionalRequest.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "User with email " + professionalRequest.getEmail() + " already exists");
        }

        Professional professional = professionalMapper.toEntity(professionalRequest);
        professional.setPassword(this.passwordEncoder.encode(professionalRequest.getPassword()));

        professional = this.professionalRepository.save(professional);

        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public UserResponse updateProfessional(ProfessionalUpdateRequest professionalRequest, UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Professional not found."));

        if (professionalRequest.getName() != null && !professionalRequest.getName().isBlank()) {
            professional.setName(professionalRequest.getName());
        }

        if (professionalRequest.getProfileImageUrl() != null) {
            professional.setProfileImageUrl(professionalRequest.getProfileImageUrl());
        }

        if (professionalRequest.getPhoneNumber() != null && !professionalRequest.getPhoneNumber().isBlank()) {
            professional.setPhoneNumber(professionalRequest.getPhoneNumber());
        }

        if (professionalRequest.getWorkingLocation() != null && !professionalRequest.getWorkingLocation().isBlank()) {
            professional.setWorkingLocation(professionalRequest.getWorkingLocation());
        }

        professional = professionalRepository.save(professional);
        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public void deleteProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Professional not found."));
        professionalRepository.delete(professional);
    }
}
