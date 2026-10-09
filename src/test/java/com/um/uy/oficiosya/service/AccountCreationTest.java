package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.response.ClientResponse;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.mapper.ProfessionalMapper;
import com.um.uy.oficiosya.mapper.ClientMapper;
import com.um.uy.oficiosya.repository.ExpertiseTradeRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Creating an account either hashes the password itself or takes a hash that was made earlier (a verified registration). */
class AccountCreationTest {

    private static final String EMAIL = "ana@example.com";

    @Mock
    private ClientRepository clientRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private ClientMapper clientMapper;
    @Mock
    private ProfileImageStorage profileImageStorage;
    @Mock
    private EmailVerificationService emailVerificationService;
    @Mock
    private ProfessionalRepository professionalRepository;
    @Mock
    private TradeRepository tradeRepository;
    @Mock
    private ExpertiseTradeRepository expertiseTradeRepository;
    @Mock
    private ProfessionalMapper professionalMapper;

    private ClientServiceImpl clientService;
    private ProfessionalServiceImpl professionalService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        clientService = new ClientServiceImpl(clientRepository, passwordEncoder, clientMapper, profileImageStorage,
                emailVerificationService);
        professionalService = new ProfessionalServiceImpl(professionalRepository, clientRepository, tradeRepository,
                expertiseTradeRepository, professionalMapper, passwordEncoder);
        when(passwordEncoder.encode("ClaveSegura2026!")).thenReturn("{argon2}fresh");
    }

    private ClientCreateRequest clientRequest() {
        return ClientCreateRequest.builder().name("Ana Perez").email(EMAIL).password("ClaveSegura2026!").build();
    }

    private ProfessionalCreateRequest professionalRequest() {
        return ProfessionalCreateRequest.builder().name("Juan Gomez").email(EMAIL).password("ClaveSegura2026!")
                .phoneNumber("099123456").workingLocation("Montevideo").build();
    }

    // --- client ---

    @Test
    void createUser_withAReadyHash_storesThatHashAndDoesNotHashAgain() {
        Client entity = Client.builder().name("Ana Perez").email(EMAIL).build();
        ClientResponse response = new ClientResponse();
        when(clientMapper.toEntity(any())).thenReturn(entity);
        when(clientRepository.save(entity)).thenReturn(entity);
        when(clientMapper.toResponse(entity)).thenReturn(response);

        ClientResponse created = clientService.createUser(clientRequest(), "{argon2}ready");

        assertSame(response, created);
        assertEquals("{argon2}ready", entity.getPassword());
        verify(passwordEncoder, never()).encode(any());
    }

    @Test
    void createUser_withAnEmailThatHasAnAccount_isRejectedAndSavesNothing() {
        when(clientRepository.existsByEmail(EMAIL)).thenReturn(true);
        var request = clientRequest();

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> clientService.createUser(request, "{argon2}ready"));

        assertEquals(400, e.getStatusCode().value());
        verify(clientRepository, never()).save(any());
    }

    // --- professional ---

    @Test
    void createProfessional_withAReadyHash_storesThatHashAndDoesNotHashAgain() {
        Professional entity = Professional.builder().name("Juan Gomez").email(EMAIL).build();
        ProfessionalResponse response = new ProfessionalResponse();
        when(professionalMapper.toEntity(any())).thenReturn(entity);
        when(professionalRepository.save(entity)).thenReturn(entity);
        when(professionalMapper.toResponse(entity)).thenReturn(response);

        ProfessionalResponse created = professionalService.createProfessional(professionalRequest(), "{argon2}ready");

        assertSame(response, created);
        assertEquals("{argon2}ready", entity.getPassword());
        verify(passwordEncoder, never()).encode(any());
    }

    @Test
    void createProfessional_withThePlainPassword_hashesItFirst() {
        Professional entity = Professional.builder().name("Juan Gomez").email(EMAIL).build();
        when(professionalMapper.toEntity(any())).thenReturn(entity);
        when(professionalRepository.save(entity)).thenReturn(entity);

        professionalService.createProfessional(professionalRequest());

        ArgumentCaptor<Professional> saved = ArgumentCaptor.forClass(Professional.class);
        verify(professionalRepository).save(saved.capture());
        assertEquals("{argon2}fresh", saved.getValue().getPassword());
    }

    @Test
    void createProfessional_withAnEmailThatHasAnAccount_isRejectedAndSavesNothing() {
        when(clientRepository.existsByEmail(EMAIL)).thenReturn(true);
        var request = professionalRequest();

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> professionalService.createProfessional(request, "{argon2}ready"));

        assertEquals(400, e.getStatusCode().value());
        verify(professionalRepository, never()).save(any());
    }
}
