package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalSearchFilters;
import com.um.uy.oficiosya.dto.response.PriceRangeResponse;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.ProfessionalPublicResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.update.ExpertiseTradeUpdateRequest;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import com.um.uy.oficiosya.entity.ExpertiseTrade;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.exception.ExpertiseTradeNotFoundException;
import com.um.uy.oficiosya.exception.TradeNotFoundException;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.mapper.ProfessionalMapper;
import com.um.uy.oficiosya.repository.ExpertiseTradeRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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

    private static final String PROFESSIONAL_NOT_FOUND = "Profesional no encontrado.";
    /** The most professionals one page of the search brings. */
    static final int MAX_PAGE_SIZE = 50;

    private final ProfessionalRepository professionalRepository;
    private final ClientRepository clientRepository;
    private final TradeRepository tradeRepository;
    private final ExpertiseTradeRepository expertiseTradeRepository;
    private final ProfessionalMapper professionalMapper;
    private final PasswordEncoder passwordEncoder;

    public ProfessionalServiceImpl(ProfessionalRepository professionalRepository,
                                   ClientRepository clientRepository,
                                   TradeRepository tradeRepository,
                                   ExpertiseTradeRepository expertiseTradeRepository,
                                   ProfessionalMapper professionalMapper,
                                   PasswordEncoder passwordEncoder) {
        this.professionalRepository = professionalRepository;
        this.clientRepository = clientRepository;
        this.tradeRepository = tradeRepository;
        this.expertiseTradeRepository = expertiseTradeRepository;
        this.professionalMapper = professionalMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public ProfessionalResponse createProfessional(ProfessionalCreateRequest professionalRequest) {
        return persist(professionalRequest, this.passwordEncoder.encode(professionalRequest.getPassword()));
    }

    @Override
    @Transactional
    public ProfessionalResponse createProfessional(ProfessionalCreateRequest professionalRequest, String encodedPassword) {
        return persist(professionalRequest, encodedPassword);
    }

    /** What both public methods do: they only differ in where the password hash comes from. */
    private ProfessionalResponse persist(ProfessionalCreateRequest professionalRequest, String encodedPassword) {
        if (this.clientRepository.existsByEmail(professionalRequest.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No se pudo completar el registro. Verificá los datos e intentá nuevamente.");
        }

        Professional professional = professionalMapper.toEntity(professionalRequest);
        professional.setPassword(encodedPassword);

        professional = this.professionalRepository.save(professional);

        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public ProfessionalResponse updateProfessional(ProfessionalUpdateRequest professionalRequest, UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new ClientNotFoundException(PROFESSIONAL_NOT_FOUND));

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
    @Transactional(readOnly = true)
    public ProfessionalResponse getProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new ClientNotFoundException(PROFESSIONAL_NOT_FOUND));
        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional(readOnly = true)
    public ProfessionalPublicResponse getPublicProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .filter(Professional::isPublished)
                .orElseThrow(() -> new ClientNotFoundException(PROFESSIONAL_NOT_FOUND));
        return professionalMapper.toPublicResponse(professional);
    }

    @Override
    @Transactional
    public void deleteProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new ClientNotFoundException(PROFESSIONAL_NOT_FOUND));
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
    public ProfessionalResponse publishProfessional(UUID id) {
        Professional professional = professionalRepository.findByPublicId(id)
                .orElseThrow(() -> new ClientNotFoundException(PROFESSIONAL_NOT_FOUND));

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
                .orElseThrow(() -> new ClientNotFoundException(PROFESSIONAL_NOT_FOUND));

        professional.setPublished(false);
        professional = professionalRepository.save(professional);
        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional
    public ProfessionalResponse addExpertiseTrade(UUID professionalId, ExpertiseTradeCreateRequest request) {
        Professional professional = professionalRepository.findByPublicId(professionalId)
                .orElseThrow(() -> new ClientNotFoundException(PROFESSIONAL_NOT_FOUND));

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
    public ProfessionalResponse updateExpertiseTrade(UUID professionalId, Long expertiseTradeId,
                                                     ExpertiseTradeUpdateRequest request) {
        ExpertiseTrade expertiseTrade = expertiseTradeRepository
                .findByIdAndProfessional_PublicId(expertiseTradeId, professionalId)
                .orElseThrow(() -> new ExpertiseTradeNotFoundException("No tienes ese oficio en tu perfil."));

        BigDecimal minimum = request.getMinimumHourlyWage() != null
                ? request.getMinimumHourlyWage() : expertiseTrade.getMinimumHourlyWage();
        BigDecimal maximum = request.getMaximumHourlyWage() != null
                ? request.getMaximumHourlyWage() : expertiseTrade.getMaximumHourlyWage();

        if (minimum.compareTo(maximum) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La tarifa mínima no puede ser mayor a la máxima");
        }

        expertiseTrade.setMinimumHourlyWage(minimum);
        expertiseTrade.setMaximumHourlyWage(maximum);
        expertiseTradeRepository.save(expertiseTrade);

        return professionalMapper.toResponse(expertiseTrade.getProfessional());
    }

    @Override
    @Transactional
    public ProfessionalResponse removeExpertiseTrade(UUID professionalId, Long expertiseTradeId) {
        ExpertiseTrade expertiseTrade = expertiseTradeRepository
                .findByIdAndProfessional_PublicId(expertiseTradeId, professionalId)
                .orElseThrow(() -> new ExpertiseTradeNotFoundException("No tienes ese oficio en tu perfil."));

        Professional professional = expertiseTrade.getProfessional();
        professional.getExpertiseTrades().remove(expertiseTrade);
        expertiseTradeRepository.delete(expertiseTrade);

        return professionalMapper.toResponse(professional);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ProfessionalPublicResponse> searchProfessionals(ProfessionalSearchFilters filters, Pageable pageable) {
        if (filters.minPrice() != null && filters.maxPrice() != null && filters.minPrice().compareTo(filters.maxPrice()) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El precio mínimo no puede ser mayor al máximo");
        }
        if ((filters.availableFrom() == null) != (filters.availableTo() == null)
                || (filters.availableFrom() != null && !filters.availableFrom().isBefore(filters.availableTo()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La disponibilidad necesita un desde anterior al hasta");
        }

        ProfessionalSearchFilters.Order order = filters.order() == null ? ProfessionalSearchFilters.Order.RELEVANCE : filters.order();
        // The order is the query's own; a page is never bigger than MAX_PAGE_SIZE.
        Pageable page = PageRequest.of(pageable.getPageNumber(), Math.min(pageable.getPageSize(), MAX_PAGE_SIZE));

        return professionalRepository
                .search(orNull(filters.tradeIds()), filters.minPrice(), filters.maxPrice(), filters.minRating(),
                        orNull(filters.location()), orNull(filters.query()),
                        filters.availableFrom(), filters.availableTo(), order.name(), page)
                .map(professionalMapper::toPublicResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public PriceRangeResponse priceRange(List<Long> tradeIds, String query) {
        return professionalRepository.priceRange(orNull(tradeIds), orNull(query));
    }

    private static List<Long> orNull(List<Long> values) {
        return values == null || values.isEmpty() ? null : values;
    }

    private static String orNull(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }
}
