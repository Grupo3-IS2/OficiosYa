package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
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
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.ProfessionalMapper;
import com.um.uy.oficiosya.repository.ExpertiseTradeRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Professional profiles: creation, partial updates, publishing, the trades they offer and the public search. */
class ProfessionalServiceImplTest {

    @Mock
    private ProfessionalRepository professionalRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private TradeRepository tradeRepository;
    @Mock
    private ExpertiseTradeRepository expertiseTradeRepository;
    @Mock
    private ProfessionalMapper professionalMapper;
    @Mock
    private PasswordEncoder passwordEncoder;

    private ProfessionalServiceImpl service;

    private final UUID id = UUID.randomUUID();
    private final ProfessionalResponse mapped = new ProfessionalResponse();
    private Professional professional;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ProfessionalServiceImpl(professionalRepository, userRepository, tradeRepository,
                expertiseTradeRepository, professionalMapper, passwordEncoder);
        professional = Professional.builder().id(1L).publicId(id).name("Beto Gómez").email("beto@example.com")
                .phoneNumber("099123456").workingLocation("Montevideo").build();
        when(professionalRepository.save(any(Professional.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(professionalMapper.toResponse(any(Professional.class))).thenReturn(mapped);
    }

    private void found() {
        when(professionalRepository.findByPublicId(id)).thenReturn(Optional.of(professional));
    }

    private void missing() {
        when(professionalRepository.findByPublicId(id)).thenReturn(Optional.empty());
    }

    // --- create ---

    private ProfessionalCreateRequest createRequest() {
        return ProfessionalCreateRequest.builder().name("Beto Gómez").email("beto@example.com")
                .password("ClaveSegura2026!").phoneNumber("099123456").workingLocation("Montevideo").build();
    }

    @Test
    void createProfessional_encodesThePasswordAndSaves() {
        ProfessionalCreateRequest request = createRequest();
        when(professionalMapper.toEntity(request)).thenReturn(professional);
        when(passwordEncoder.encode("ClaveSegura2026!")).thenReturn("encoded");

        assertSame(mapped, service.createProfessional(request));
        assertEquals("encoded", professional.getPassword());
    }

    @Test
    void createProfessional_withAnEncodedPassword_usesItAsIs() {
        ProfessionalCreateRequest request = createRequest();
        when(professionalMapper.toEntity(request)).thenReturn(professional);

        service.createProfessional(request, "already-encoded");

        assertEquals("already-encoded", professional.getPassword());
        verify(passwordEncoder, never()).encode(any());
    }

    @Test
    void createProfessional_takenEmail_isRejected() {
        ProfessionalCreateRequest request = createRequest();
        when(userRepository.existsByEmail("beto@example.com")).thenReturn(true);

        assertThrows(ResponseStatusException.class, () -> service.createProfessional(request, "x"));
        verify(professionalRepository, never()).save(any());
    }

    // --- update ---

    @Test
    void updateProfessional_appliesTheNonBlankFields() {
        found();
        ProfessionalUpdateRequest request = ProfessionalUpdateRequest.builder().name("Roberto Gómez")
                .phoneNumber("098765432").workingLocation("Canelones")
                .description("Plomero con veinte años de experiencia").build();

        service.updateProfessional(request, id);

        assertEquals("Roberto Gómez", professional.getName());
        assertEquals("098765432", professional.getPhoneNumber());
        assertEquals("Canelones", professional.getWorkingLocation());
        assertEquals("Plomero con veinte años de experiencia", professional.getDescription());
    }

    @Test
    void updateProfessional_blankOrMissingFields_keepTheCurrentValues() {
        found();
        ProfessionalUpdateRequest request = ProfessionalUpdateRequest.builder().name(" ")
                .phoneNumber(" ").workingLocation(" ").description(" ").build();

        service.updateProfessional(request, id);
        service.updateProfessional(new ProfessionalUpdateRequest(), id);

        assertEquals("Beto Gómez", professional.getName());
        assertEquals("099123456", professional.getPhoneNumber());
        assertEquals("Montevideo", professional.getWorkingLocation());
        assertNull(professional.getDescription());
    }

    @Test
    void updateProfessional_unknown_isNotFound() {
        missing();
        ProfessionalUpdateRequest request = new ProfessionalUpdateRequest();

        assertThrows(UserNotFoundException.class, () -> service.updateProfessional(request, id));
    }

    // --- read / delete / list ---

    @Test
    void getProfessional_mapsIt() {
        found();

        assertSame(mapped, service.getProfessional(id));
    }

    @Test
    void getProfessional_unknown_isNotFound() {
        missing();

        assertThrows(UserNotFoundException.class, () -> service.getProfessional(id));
    }

    @Test
    void getPublicProfessional_published_isVisible() {
        professional.setPublished(true);
        found();
        ProfessionalPublicResponse publicResponse = new ProfessionalPublicResponse();
        when(professionalMapper.toPublicResponse(professional)).thenReturn(publicResponse);

        assertSame(publicResponse, service.getPublicProfessional(id));
    }

    @Test
    void getPublicProfessional_unpublished_isNotFound() {
        found();

        assertThrows(UserNotFoundException.class, () -> service.getPublicProfessional(id));
    }

    @Test
    void deleteProfessional_deletesIt() {
        found();

        service.deleteProfessional(id);

        verify(professionalRepository).delete(professional);
    }

    @Test
    void deleteProfessional_unknown_isNotFound() {
        missing();

        assertThrows(UserNotFoundException.class, () -> service.deleteProfessional(id));
    }

    @Test
    void listProfessionals_mapsEveryone() {
        when(professionalRepository.findAll()).thenReturn(List.of(professional, professional));

        assertEquals(2, service.listProfessionals().size());
    }

    // --- publish ---

    private ExpertiseTrade expertise(BigDecimal minimum, BigDecimal maximum) {
        return ExpertiseTrade.builder().id(4L).professional(professional)
                .trade(Trade.builder().id(3L).name("Plomería").build())
                .minimumHourlyWage(minimum).maximumHourlyWage(maximum).build();
    }

    @Test
    void publishProfessional_withDescriptionAndTrades_isPublished() {
        professional.setDescription("Plomero con veinte años de experiencia");
        professional.getExpertiseTrades().add(expertise(BigDecimal.ONE, BigDecimal.TEN));
        found();

        service.publishProfessional(id);

        assertTrue(professional.isPublished());
    }

    @Test
    void publishProfessional_withoutDescription_isRejected() {
        found();

        assertThrows(ResponseStatusException.class, () -> service.publishProfessional(id));
        professional.setDescription("  ");
        assertThrows(ResponseStatusException.class, () -> service.publishProfessional(id));
        assertFalse(professional.isPublished());
    }

    @Test
    void publishProfessional_withoutTrades_isRejected() {
        professional.setDescription("Plomero con veinte años de experiencia");
        found();

        assertThrows(ResponseStatusException.class, () -> service.publishProfessional(id));
        assertFalse(professional.isPublished());
    }

    @Test
    void publishProfessional_unknown_isNotFound() {
        missing();

        assertThrows(UserNotFoundException.class, () -> service.publishProfessional(id));
    }

    @Test
    void unpublishProfessional_hidesTheProfile() {
        professional.setPublished(true);
        found();

        service.unpublishProfessional(id);

        assertFalse(professional.isPublished());
    }

    @Test
    void unpublishProfessional_unknown_isNotFound() {
        missing();

        assertThrows(UserNotFoundException.class, () -> service.unpublishProfessional(id));
    }

    // --- expertise trades ---

    private ExpertiseTradeCreateRequest addRequest(long minimum, long maximum) {
        ExpertiseTradeCreateRequest request = new ExpertiseTradeCreateRequest();
        request.setTradeId(3L);
        request.setMinimumHourlyWage(BigDecimal.valueOf(minimum));
        request.setMaximumHourlyWage(BigDecimal.valueOf(maximum));
        return request;
    }

    @Test
    void addExpertiseTrade_savesItOnTheProfile() {
        found();
        when(tradeRepository.findById(3L)).thenReturn(Optional.of(Trade.builder().id(3L).name("Plomería").build()));

        service.addExpertiseTrade(id, addRequest(100, 200));

        ArgumentCaptor<ExpertiseTrade> saved = ArgumentCaptor.forClass(ExpertiseTrade.class);
        verify(expertiseTradeRepository).save(saved.capture());
        assertEquals(BigDecimal.valueOf(100), saved.getValue().getMinimumHourlyWage());
        assertEquals(1, professional.getExpertiseTrades().size());
    }

    @Test
    void addExpertiseTrade_unknownProfessional_isNotFound() {
        missing();
        ExpertiseTradeCreateRequest request = addRequest(100, 200);

        assertThrows(UserNotFoundException.class, () -> service.addExpertiseTrade(id, request));
    }

    @Test
    void addExpertiseTrade_minimumAboveMaximum_isRejected() {
        found();
        ExpertiseTradeCreateRequest request = addRequest(300, 200);

        assertThrows(ResponseStatusException.class, () -> service.addExpertiseTrade(id, request));
    }

    @Test
    void addExpertiseTrade_alreadyOffered_isAConflict() {
        found();
        when(expertiseTradeRepository.existsByProfessional_PublicIdAndTrade_Id(id, 3L)).thenReturn(true);
        ExpertiseTradeCreateRequest request = addRequest(100, 200);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.addExpertiseTrade(id, request));
        assertEquals(409, e.getStatusCode().value());
    }

    @Test
    void addExpertiseTrade_unknownTrade_isNotFound() {
        found();
        when(tradeRepository.findById(3L)).thenReturn(Optional.empty());
        ExpertiseTradeCreateRequest request = addRequest(100, 200);

        assertThrows(TradeNotFoundException.class, () -> service.addExpertiseTrade(id, request));
    }

    private ExpertiseTradeUpdateRequest updateRequest(Long minimum, Long maximum) {
        ExpertiseTradeUpdateRequest request = new ExpertiseTradeUpdateRequest();
        request.setMinimumHourlyWage(minimum == null ? null : BigDecimal.valueOf(minimum));
        request.setMaximumHourlyWage(maximum == null ? null : BigDecimal.valueOf(maximum));
        return request;
    }

    @Test
    void updateExpertiseTrade_changesTheRatesSent() {
        ExpertiseTrade expertiseTrade = expertise(BigDecimal.valueOf(100), BigDecimal.valueOf(200));
        when(expertiseTradeRepository.findByIdAndProfessional_PublicId(4L, id)).thenReturn(Optional.of(expertiseTrade));

        service.updateExpertiseTrade(id, 4L, updateRequest(150L, null));
        assertEquals(BigDecimal.valueOf(150), expertiseTrade.getMinimumHourlyWage());
        assertEquals(BigDecimal.valueOf(200), expertiseTrade.getMaximumHourlyWage());

        service.updateExpertiseTrade(id, 4L, updateRequest(null, 250L));
        assertEquals(BigDecimal.valueOf(150), expertiseTrade.getMinimumHourlyWage());
        assertEquals(BigDecimal.valueOf(250), expertiseTrade.getMaximumHourlyWage());
    }

    @Test
    void updateExpertiseTrade_minimumAboveMaximum_isRejected() {
        ExpertiseTrade expertiseTrade = expertise(BigDecimal.valueOf(100), BigDecimal.valueOf(200));
        when(expertiseTradeRepository.findByIdAndProfessional_PublicId(4L, id)).thenReturn(Optional.of(expertiseTrade));
        ExpertiseTradeUpdateRequest request = updateRequest(300L, null);

        assertThrows(ResponseStatusException.class, () -> service.updateExpertiseTrade(id, 4L, request));
    }

    @Test
    void updateExpertiseTrade_notOnTheProfile_isNotFound() {
        when(expertiseTradeRepository.findByIdAndProfessional_PublicId(4L, id)).thenReturn(Optional.empty());
        ExpertiseTradeUpdateRequest request = updateRequest(1L, 2L);

        assertThrows(ExpertiseTradeNotFoundException.class, () -> service.updateExpertiseTrade(id, 4L, request));
    }

    @Test
    void removeExpertiseTrade_deletesItFromTheProfile() {
        ExpertiseTrade expertiseTrade = expertise(BigDecimal.ONE, BigDecimal.TEN);
        professional.getExpertiseTrades().add(expertiseTrade);
        when(expertiseTradeRepository.findByIdAndProfessional_PublicId(4L, id)).thenReturn(Optional.of(expertiseTrade));

        service.removeExpertiseTrade(id, 4L);

        verify(expertiseTradeRepository).delete(expertiseTrade);
        assertTrue(professional.getExpertiseTrades().isEmpty());
    }

    @Test
    void removeExpertiseTrade_notOnTheProfile_isNotFound() {
        when(expertiseTradeRepository.findByIdAndProfessional_PublicId(4L, id)).thenReturn(Optional.empty());

        assertThrows(ExpertiseTradeNotFoundException.class, () -> service.removeExpertiseTrade(id, 4L));
    }

    // --- search ---

    @Test
    void searchProfessionals_normalizesTheFilters() {
        Pageable pageable = PageRequest.of(0, 10);
        Page<Professional> page = new PageImpl<>(List.of(professional));
        when(professionalRepository.search(List.of(3L), BigDecimal.ONE, BigDecimal.TEN, 5.0, "Montevideo", "beto", pageable))
                .thenReturn(page);
        when(professionalMapper.toPublicResponse(professional)).thenReturn(new ProfessionalPublicResponse());

        Page<ProfessionalPublicResponse> result = service.searchProfessionals(List.of(3L), BigDecimal.ONE, BigDecimal.TEN,
                5.0, "  Montevideo ", " beto ", pageable);

        assertEquals(1, result.getTotalElements());
    }

    @Test
    void searchProfessionals_emptyFilters_areSentAsNull() {
        Pageable pageable = PageRequest.of(0, 10);
        when(professionalRepository.search(any(), any(), any(), any(), any(), any(), any())).thenReturn(Page.empty());

        service.searchProfessionals(List.of(), null, null, null, " ", " ", pageable);
        service.searchProfessionals(null, BigDecimal.ONE, null, null, null, null, pageable);
        service.searchProfessionals(null, null, BigDecimal.ONE, null, null, null, pageable);

        verify(professionalRepository).search(null, null, null, null, null, null, pageable);
    }

    @Test
    void searchProfessionals_minimumPriceAboveMaximum_isRejected() {
        Pageable pageable = mock(Pageable.class);

        assertThrows(ResponseStatusException.class, () -> service.searchProfessionals(null, BigDecimal.TEN,
                BigDecimal.ONE, null, null, null, pageable));
    }
}
