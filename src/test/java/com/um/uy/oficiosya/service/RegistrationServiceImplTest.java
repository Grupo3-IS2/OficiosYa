package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.PendingRegistrationResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService.VerificationResult;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RegistrationServiceImplTest {

    private static final String EMAIL = "ana@example.com";
    private static final String NAME = "Ana Perez";
    private static final String PASSWORD = "Str0ng!Password";
    private static final String HASH = "{argon2}hashed";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Mock
    private UserRepository userRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private EmailVerificationService emailVerificationService;
    @Mock
    private ClientService clientService;
    @Mock
    private ProfessionalService professionalService;
    @Mock
    private JwtService jwtService;

    private RegistrationServiceImpl service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new RegistrationServiceImpl(userRepository, passwordEncoder, emailVerificationService,
                clientService, professionalService, jwtService);
        ReflectionTestUtils.setField(service, "codeLength", 6);
        ReflectionTestUtils.setField(service, "expirationMinutes", 15L);
        ReflectionTestUtils.setField(service, "resendCooldownSeconds", 60L);
        when(passwordEncoder.encode(PASSWORD)).thenReturn(HASH);
    }

    private ClientCreateRequest clientRequest() {
        return ClientCreateRequest.builder().name(NAME).email(EMAIL).password(PASSWORD).build();
    }

    private ProfessionalCreateRequest professionalRequest() {
        return ProfessionalCreateRequest.builder().name(NAME).email(EMAIL).password(PASSWORD)
                .phoneNumber("+59899123456").workingLocation("Montevideo").build();
    }

    private String payloadOf(Role type, String phone, String location) {
        return JSON.writeValueAsString(new PendingRegistration(type, NAME, HASH, phone, location));
    }

    // --- startRegistration ---

    @Test
    void startRegistration_keepsTheDataPendingAndCreatesNoAccount() {
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);

        PendingRegistrationResponse response = service.startRegistration(clientRequest());

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(emailVerificationService).sendCode(
                eq(EMAIL), eq(VerificationPurpose.REGISTER), isNull(), payload.capture());
        verify(clientService, never()).createClient(any(), anyString());
        verify(clientService, never()).createClient(any());

        assertEquals(EMAIL, response.getEmail());
        assertEquals(6, response.getCodeLength());
        assertEquals(15 * 60, response.getExpiresInSeconds());
        assertEquals(60, response.getResendCooldownSeconds());

        PendingRegistration stored = JSON.readValue(payload.getValue(), PendingRegistration.class);
        assertEquals(Role.CLIENT, stored.accountType());
        assertEquals(NAME, stored.name());
        assertEquals(HASH, stored.passwordHash());
    }

    @Test
    void startRegistration_neverStoresThePlainPassword() {
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);

        service.startRegistration(clientRequest());

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(emailVerificationService).sendCode(anyString(), any(), any(), payload.capture());
        assertFalse(payload.getValue().contains(PASSWORD));
    }

    @Test
    void startRegistration_forAProfessional_carriesPhoneAndLocation() {
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);

        service.startRegistration(professionalRequest());

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(emailVerificationService).sendCode(anyString(), any(), any(), payload.capture());
        PendingRegistration stored = JSON.readValue(payload.getValue(), PendingRegistration.class);
        assertEquals(Role.PROFESSIONAL, stored.accountType());
        assertEquals("+59899123456", stored.phoneNumber());
        assertEquals("Montevideo", stored.workingLocation());
    }

    @Test
    void startRegistration_withAnEmailThatHasAnAccount_answersTheSameAndSendsNothing() {
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(true);

        PendingRegistrationResponse taken = service.startRegistration(clientRequest());

        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);
        PendingRegistrationResponse free = service.startRegistration(clientRequest());

        assertEquals(free, taken);
        // Only the second call sent a code.
        verify(emailVerificationService).sendCode(anyString(), any(), any(), anyString());
    }

    // --- verifyEmail ---

    @Test
    void verifyEmail_forAClient_createsTheAccountWithTheStoredHashAndLogsIn() {
        UUID publicId = UUID.randomUUID();
        Client client = Client.builder().publicId(publicId).name(NAME).email(EMAIL).password(HASH).build();

        when(emailVerificationService.verifyCode(EMAIL, VerificationPurpose.REGISTER, "123456"))
                .thenReturn(new VerificationResult(null, payloadOf(Role.CLIENT, null, null)));
        when(clientService.createClient(any(), eq(HASH))).thenReturn(userResponse(publicId, Role.CLIENT));
        when(userRepository.findByPublicId(publicId)).thenReturn(Optional.of(client));
        when(jwtService.generateToken(client)).thenReturn("jwt-token");

        LoginResponse response = service.verifyEmail(
                VerifyEmailRequest.builder().email(EMAIL).code("123456").build());

        ArgumentCaptor<ClientCreateRequest> created = ArgumentCaptor.forClass(ClientCreateRequest.class);
        verify(clientService).createClient(created.capture(), eq(HASH));
        assertEquals(EMAIL, created.getValue().getEmail());
        assertEquals(NAME, created.getValue().getName());

        assertEquals("jwt-token", response.getToken());
        assertEquals(publicId, response.getId());
        assertEquals(Role.CLIENT, response.getRole());
        assertEquals(EMAIL, response.getEmail());
    }

    @Test
    void verifyEmail_forAProfessional_createsAProfessionalWithItsData() {
        UUID publicId = UUID.randomUUID();
        Professional professional = Professional.builder().publicId(publicId).name(NAME).email(EMAIL)
                .password(HASH).build();

        when(emailVerificationService.verifyCode(EMAIL, VerificationPurpose.REGISTER, "123456"))
                .thenReturn(new VerificationResult(null, payloadOf(Role.PROFESSIONAL, "+59899123456", "Montevideo")));
        when(professionalService.createProfessional(any(), eq(HASH)))
                .thenReturn(professionalResponse(publicId));
        when(userRepository.findByPublicId(publicId)).thenReturn(Optional.of(professional));
        when(jwtService.generateToken(professional)).thenReturn("jwt-token");

        LoginResponse response = service.verifyEmail(
                VerifyEmailRequest.builder().email(EMAIL).code("123456").build());

        ArgumentCaptor<ProfessionalCreateRequest> created = ArgumentCaptor.forClass(ProfessionalCreateRequest.class);
        verify(professionalService).createProfessional(created.capture(), eq(HASH));
        assertEquals("+59899123456", created.getValue().getPhoneNumber());
        assertEquals("Montevideo", created.getValue().getWorkingLocation());
        assertEquals(Role.PROFESSIONAL, response.getRole());
    }

    @Test
    void verifyEmail_withABadCode_createsNothing() {
        when(emailVerificationService.verifyCode(EMAIL, VerificationPurpose.REGISTER, "000000"))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Código incorrecto o vencido"));

        assertThrows(ResponseStatusException.class, () -> service.verifyEmail(
                VerifyEmailRequest.builder().email(EMAIL).code("000000").build()));

        verifyNoInteractions(clientService, professionalService, jwtService);
    }

    @Test
    void verifyEmail_withACodeThatCarriesNoRegistration_isRejected() {
        when(emailVerificationService.verifyCode(EMAIL, VerificationPurpose.REGISTER, "123456"))
                .thenReturn(new VerificationResult(UUID.randomUUID(), null));

        assertThrows(ResponseStatusException.class, () -> service.verifyEmail(
                VerifyEmailRequest.builder().email(EMAIL).code("123456").build()));

        verifyNoInteractions(clientService, professionalService);
    }

    @Test
    void verifyEmail_normalizesTheEmail() {
        when(emailVerificationService.verifyCode(EMAIL, VerificationPurpose.REGISTER, "123456"))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "x"));

        // Built directly, so the setter that lowercases is not involved.
        assertThrows(ResponseStatusException.class, () -> service.verifyEmail(
                VerifyEmailRequest.builder().email("  Ana@Example.COM ").code("123456").build()));

        verify(emailVerificationService).verifyCode(EMAIL, VerificationPurpose.REGISTER, "123456");
    }

    // --- resendCode ---

    @Test
    void resendCode_sendsANewCodeWithTheSameData() {
        String payload = payloadOf(Role.CLIENT, null, null);
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);
        when(emailVerificationService.findPending(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.of(new VerificationResult(null, payload)));

        service.resendCode(ResendCodeRequest.builder().email(EMAIL).build());

        verify(emailVerificationService).sendCode(EMAIL, VerificationPurpose.REGISTER, null, payload);
    }

    @Test
    void resendCode_withNothingPending_answersTheSameAndSendsNothing() {
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);
        when(emailVerificationService.findPending(EMAIL, VerificationPurpose.REGISTER))
                .thenReturn(Optional.empty());

        PendingRegistrationResponse response = service.resendCode(ResendCodeRequest.builder().email(EMAIL).build());

        assertEquals(EMAIL, response.getEmail());
        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), any());
    }

    @Test
    void resendCode_whenTheAccountAlreadyExists_sendsNothing() {
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(true);

        service.resendCode(ResendCodeRequest.builder().email(EMAIL).build());

        assertTrue(true);
        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), any());
    }

    private UserResponse userResponse(UUID publicId, Role role) {
        UserResponse response = new UserResponse();
        response.setId(publicId);
        response.setEmail(EMAIL);
        response.setName(NAME);
        response.setRole(role);
        return response;
    }

    private com.um.uy.oficiosya.dto.response.ProfessionalResponse professionalResponse(UUID publicId) {
        com.um.uy.oficiosya.dto.response.ProfessionalResponse response =
                new com.um.uy.oficiosya.dto.response.ProfessionalResponse();
        response.setId(publicId);
        response.setEmail(EMAIL);
        response.setName(NAME);
        response.setRole(Role.PROFESSIONAL);
        return response;
    }
}
