package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.ProfessionalPublicResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import com.um.uy.oficiosya.entity.ExpertiseTrade;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.exception.ExpertiseTradeNotFoundException;
import com.um.uy.oficiosya.exception.TradeNotFoundException;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.ProfessionalMapper;
import com.um.uy.oficiosya.repository.ExpertiseTradeRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
public class ProfessionalServiceImpl implements ProfessionalService {

    private final ProfessionalRepository professionalRepository;
    private final UserRepository userRepository;
    private final TradeRepository tradeRepository;
    private final ExpertiseTradeRepository expertiseTradeRepository;
    private final ProfessionalMapper professionalMapper;
    private final PasswordEncoder passwordEncoder;

    public ProfessionalServiceImpl(ProfessionalRepository professionalRepository,
                                   UserRepository userRepository,
                                   TradeRepository tradeRepository,
                                   ExpertiseTradeRepository expertiseTradeRepository,
                                   ProfessionalMapper professionalMapper,
                                   PasswordEncoder passwordEncoder) {
        this.professionalRepository = professionalRepository;
        this.userRepository = userRepository;
        this.tradeRepository = tradeRepository;
        this.expertiseTradeRepository = expertiseTradeRepository;
        this.professionalMapper = professionalMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public ProfessionalResponse createProfessional(ProfessionalCreateRequest professionalRequest) {
        if (this.userRepository.existsByEmail(professionalRequest.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No se pudo completar el registro. Verificá los datos e intentá nuevamente.");
        }

        Professional professional = professionalMapper.toEntity(professionalRequest);
        professional.setPassword(this.passwordEncoder.encode(professionalRequest.getPassword()));

        professional = this.professionalRepository.save(professional);

        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public ProfessionalResponse updateProfessional(ProfessionalUpdateRequest professionalRequest, UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));

        if (professionalRequest.getName() != null && !professionalRequest.getName().isBlank()) {
            professional.setName(professionalRequest.getName());
        }

        if (professionalRequest.getPhoneNumber() != null && !professionalRequest.getPhoneNumber().isBlank()) {
            professional.setPhoneNumber(professionalRequest.getPhoneNumber());
        }

        if (professionalRequest.getWorkingLocation() != null && !professionalRequest.getWorkingLocation().isBlank()) {
            professional.setWorkingLocation(professionalRequest.getWorkingLocation());
        }

        if (professionalRequest.getDescription() != null && !professionalRequest.getDescription().isBlank()) {
            professional.setDescription(professionalRequest.getDescription());
        }

        professional = professionalRepository.save(professional);
        return professionalMapper.toResponse(professional);
    }

    @Override
    public ProfessionalResponse getProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));
        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional(readOnly = true)
    public ProfessionalPublicResponse getPublicProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .filter(Professional::isPublished)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));
        return professionalMapper.toPublicResponse(professional);
    }

    @Override
    @Transactional
    public void deleteProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));
        professionalRepository.delete(professional);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProfessionalResponse> listProfessionals() {
        return professionalRepository.findAll().stream()
                .map(professionalMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public ProfessionalResponse updateRating(UUID professionalId, Double rating) {
        Professional professional = professionalRepository.findByPublicId(professionalId)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));

        professional.setRating(rating);
        professional = professionalRepository.save(professional);
        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public ProfessionalResponse publishProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));

        if (professional.getDescription() == null || professional.getDescription().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Completá la descripción antes de publicar tu perfil");
        }

        if (professional.getExpertiseTrades().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Agregá al menos un oficio antes de publicar tu perfil");
        }

        professional.setPublished(true);
        professional = professionalRepository.save(professional);
        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public ProfessionalResponse unpublishProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));

        professional.setPublished(false);
        professional = professionalRepository.save(professional);
        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public ProfessionalResponse addExpertiseTrade(UUID professionalId, ExpertiseTradeCreateRequest request) {
        Professional professional = professionalRepository.findByPublicId(professionalId)
                .orElseThrow(() -> new UserNotFoundException("Profesional no encontrado."));

        if (request.getMinimumHourlyWage().compareTo(request.getMaximumHourlyWage()) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La tarifa mínima no puede ser mayor a la máxima");
        }

        if (expertiseTradeRepository.existsByProfessional_PublicIdAndTrade_Id(professionalId, request.getTradeId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya agregaste ese oficio a tu perfil");
        }

        Trade trade = tradeRepository.findById(request.getTradeId())
                .orElseThrow(() -> new TradeNotFoundException("Oficio no encontrado."));

        ExpertiseTrade expertiseTrade = ExpertiseTrade.builder()
                .professional(professional)
                .trade(trade)
                .minimumHourlyWage(request.getMinimumHourlyWage())
                .maximumHourlyWage(request.getMaximumHourlyWage())
                .build();

        expertiseTradeRepository.save(expertiseTrade);
        professional.getExpertiseTrades().add(expertiseTrade);

        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public ProfessionalResponse removeExpertiseTrade(UUID professionalId, Long expertiseTradeId) {
        ExpertiseTrade expertiseTrade = expertiseTradeRepository
                .findByIdAndProfessional_PublicId(expertiseTradeId, professionalId)
                .orElseThrow(() -> new ExpertiseTradeNotFoundException("No tenés ese oficio en tu perfil."));

        Professional professional = expertiseTrade.getProfessional();
        professional.getExpertiseTrades().remove(expertiseTrade);
        expertiseTradeRepository.delete(expertiseTrade);

        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ProfessionalPublicResponse> searchProfessionals(List<Long> tradeIds, BigDecimal minPrice, BigDecimal maxPrice,
                                                            Double minRating, String location, String query,
                                                            Pageable pageable) {
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El precio mínimo no puede ser mayor al máximo");
        }

        List<Long> normalizedTradeIds = (tradeIds == null || tradeIds.isEmpty()) ? null : tradeIds;
        String normalizedLocation = (location == null || location.isBlank()) ? null : location.trim();
        String normalizedQuery = (query == null || query.isBlank()) ? null : query.trim();

        return professionalRepository
                .search(normalizedTradeIds, minPrice, maxPrice, minRating, normalizedLocation, normalizedQuery, pageable)
                .map(professionalMapper::toPublicResponse);
    }
}
