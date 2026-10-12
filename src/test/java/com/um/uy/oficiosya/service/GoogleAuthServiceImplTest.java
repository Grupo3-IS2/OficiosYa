package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.GoogleCredentialRequest;
import com.um.uy.oficiosya.dto.request.GoogleLinkRequest;
import com.um.uy.oficiosya.dto.request.GoogleProfessionalRegisterRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.response.ClientResponse;
import com.um.uy.oficiosya.dto.update.GoogleLinkUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleUnlinkRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.mapper.ClientMapper;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.GoogleTokenVerifier;
import com.um.uy.oficiosya.service.interfaces.GoogleTokenVerifier.GoogleIdentity;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GoogleAuthServiceImplTest {

    private static final String EMAIL = "ana@example.com";
    private static final String SUBJECT = "google-sub-1";
    private static final String CREDENTIAL = "id-token";
    private static final String PASSWORD = "Str0ng!Passw0rd";
    private static final String HASH = "{argon2}account-hash";
    private static final GoogleIdentity IDENTITY = new GoogleIdentity(SUBJECT, EMAIL, "Ana Pérez");

    @Mock
    private GoogleTokenVerifier googleTokenVerifier;
    @Mock
    private ClientRepository clientRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private ClientService clientService;
    @Mock
    private ProfessionalService professionalService;
    @Mock
    private JwtService jwtService;
    @Mock
    private ClientMapper clientMapper;

    private GoogleAuthServiceImpl service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        when(passwordEncoder.encode(anyString())).thenAnswer(call -> "{argon2}" + call.getArgument(0));
        service = new GoogleAuthServiceImpl(googleTokenVerifier, clientRepository, passwordEncoder,
                clientService, professionalService, jwtService, clientMapper);
        when(googleTokenVerifier.verify(CREDENTIAL)).thenReturn(IDENTITY);
        when(passwordEncoder.matches(PASSWORD, HASH)).thenReturn(true);
        when(clientRepository.save(any(Client.class))).thenAnswer(call -> call.getArgument(0));
    }

    private Client localAccount() {
        return Client.builder().id(1L).publicId(UUID.randomUUID()).name("Ana Pérez").email(EMAIL)
                .password(HASH).build();
    }

    private GoogleCredentialRequest credential() {
        return GoogleCredentialRequest.builder().credential(CREDENTIAL).build();
    }

    private GoogleLinkRequest linkRequest(String password) {
        return GoogleLinkRequest.builder().credential(CREDENTIAL).password(password).build();
    }

    private void expectStatus(int status, Runnable action) {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, action::run);
        assertEquals(status, e.getStatusCode().value());
    }

    // --- login ---

    @Test
    void login_withAnAccountLinkedToThisGoogle_logsIn() {
        Client account = localAccount();
        account.setGoogleSubject(SUBJECT);
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.of(account));
        when(jwtService.generateToken(account)).thenReturn("jwt");

        LoginResponse response = service.login(credential());

        assertEquals("jwt", response.getToken());
        assertEquals(Role.CLIENT, response.getRole());
        assertEquals(account.getPublicId(), response.getId());
    }

    @Test
    void login_withNoAccount_is404() {
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.empty());
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.empty());

        expectStatus(404, () -> service.login(credential()));
    }

    @Test
    void login_withAPasswordAccountNotLinked_is409AndLinksNothing() {
        Client account = localAccount();
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.empty());
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(account));

        expectStatus(409, () -> service.login(credential()));

        assertNull(account.getGoogleSubject());
        verify(clientRepository, never()).save(any());
        verify(jwtService, never()).generateToken(any(Client.class));
    }

    @Test
    void login_withAnAccountLinkedToAnotherGoogle_is400() {
        Client account = localAccount();
        account.setGoogleSubject("someone-elses-sub");
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.empty());
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(account));

        expectStatus(400, () -> service.login(credential()));
    }

    // --- link ---

    @Test
    void link_withTheRightPassword_linksAndLogsIn() {
        Client account = localAccount();
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(account));
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.empty());
        when(jwtService.generateToken(account)).thenReturn("jwt");

        LoginResponse response = service.link(linkRequest(PASSWORD));

        assertEquals(SUBJECT, account.getGoogleSubject());
        verify(clientRepository).save(account);
        assertEquals("jwt", response.getToken());
    }

    @Test
    void link_withAWrongPassword_linksNothing() {
        Client account = localAccount();
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(account));

        expectStatus(400, () -> service.link(linkRequest("wrong")));

        assertNull(account.getGoogleSubject());
        verify(clientRepository, never()).save(any());
    }

    @Test
    void link_withNoAccount_answersLikeAWrongPasswordAndStillComparesAPassword() {
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.empty());
        var request = linkRequest(PASSWORD);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.link(request));

        assertEquals(400, e.getStatusCode().value());
        assertEquals("Contraseña incorrecta", e.getReason());
        verify(passwordEncoder).matches(eq(PASSWORD), anyString());
    }

    @Test
    void link_whenThatGoogleBelongsToAnotherAccount_is400() {
        Client account = localAccount();
        Client other = localAccount();
        other.setId(2L);
        other.setGoogleSubject(SUBJECT);
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(account));
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.of(other));

        expectStatus(400, () -> service.link(linkRequest(PASSWORD)));

        assertNull(account.getGoogleSubject());
    }

    @Test
    void link_whenTheAccountHasAnotherGoogleLinked_is400() {
        Client account = localAccount();
        account.setGoogleSubject("someone-elses-sub");
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(account));

        expectStatus(400, () -> service.link(linkRequest(PASSWORD)));

        assertEquals("someone-elses-sub", account.getGoogleSubject());
    }

    // --- register ---

    @Test
    void registerClient_createsAGoogleAccountWithAnUnknownPassword() {
        UUID publicId = UUID.randomUUID();
        Client created = Client.builder().id(5L).publicId(publicId).name("Ana Pérez").email(EMAIL).password("x").build();
        ClientResponse createdResponse = new ClientResponse();
        createdResponse.setId(publicId);

        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.empty());
        when(clientRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);
        when(clientService.createUser(any(), anyString())).thenReturn(createdResponse);
        when(clientRepository.findByPublicId(publicId)).thenReturn(Optional.of(created));
        when(jwtService.generateToken(created)).thenReturn("jwt");

        LoginResponse response = service.registerClient(credential());

        ArgumentCaptor<ClientCreateRequest> request = ArgumentCaptor.forClass(ClientCreateRequest.class);
        ArgumentCaptor<String> passwordHash = ArgumentCaptor.forClass(String.class);
        verify(clientService).createUser(request.capture(), passwordHash.capture());
        assertEquals(EMAIL, request.getValue().getEmail());
        assertEquals("Ana Pérez", request.getValue().getName());
        assertTrue(passwordHash.getValue().startsWith("{argon2}"));

        assertEquals(AuthProvider.GOOGLE, created.getAuthProvider());
        assertEquals(SUBJECT, created.getGoogleSubject());
        assertEquals("jwt", response.getToken());
        assertEquals(Role.CLIENT, response.getRole());
    }

    @Test
    void registerClient_usesTheEmailNameWhenGoogleGivesNone() {
        when(googleTokenVerifier.verify(CREDENTIAL)).thenReturn(new GoogleIdentity(SUBJECT, EMAIL, "  "));
        UUID publicId = UUID.randomUUID();
        ClientResponse createdResponse = new ClientResponse();
        createdResponse.setId(publicId);
        when(clientService.createUser(any(), anyString())).thenReturn(createdResponse);
        when(clientRepository.findByPublicId(publicId)).thenReturn(Optional.of(localAccount()));

        service.registerClient(credential());

        ArgumentCaptor<ClientCreateRequest> request = ArgumentCaptor.forClass(ClientCreateRequest.class);
        verify(clientService).createUser(request.capture(), anyString());
        assertEquals("ana", request.getValue().getName());
    }

    @Test
    void registerClient_withAnEmailThatHasAnAccount_isRejectedAndCreatesNothing() {
        when(clientRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(true);

        expectStatus(400, () -> service.registerClient(credential()));

        verify(clientService, never()).createUser(any(), anyString());
    }

    @Test
    void registerClient_withAGoogleAlreadyRegistered_isRejected() {
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.of(localAccount()));

        expectStatus(400, () -> service.registerClient(credential()));

        verify(clientService, never()).createUser(any(), anyString());
    }

    @Test
    void registerProfessional_carriesPhoneAndLocation() {
        UUID publicId = UUID.randomUUID();
        ProfessionalResponse createdResponse = new ProfessionalResponse();
        createdResponse.setId(publicId);
        Client stored = localAccount();
        when(professionalService.createProfessional(any(), anyString())).thenReturn(createdResponse);
        when(clientRepository.findByPublicId(publicId)).thenReturn(Optional.of(stored));

        service.registerProfessional(GoogleProfessionalRegisterRequest.builder()
                .credential(CREDENTIAL).phoneNumber("099123456").workingLocation("Montevideo").build());

        ArgumentCaptor<ProfessionalCreateRequest> request = ArgumentCaptor.forClass(ProfessionalCreateRequest.class);
        verify(professionalService).createProfessional(request.capture(), anyString());
        assertEquals("099123456", request.getValue().getPhoneNumber());
        assertEquals("Montevideo", request.getValue().getWorkingLocation());
        assertEquals(EMAIL, request.getValue().getEmail());
        assertEquals(AuthProvider.GOOGLE, stored.getAuthProvider());
    }

    // --- from the profile ---

    @Test
    void linkToUser_withTheRightPassword_linksGoogle() {
        Client account = localAccount();
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.empty());

        service.linkToUser(account.getPublicId(),
                GoogleLinkUpdateRequest.builder().credential(CREDENTIAL).currentPassword(PASSWORD).build());

        assertEquals(SUBJECT, account.getGoogleSubject());
        verify(clientRepository).save(account);
    }

    @Test
    void linkToUser_withAGoogleThatHasAnotherEmail_isRejectedAndLinksNothing() {
        when(googleTokenVerifier.verify(CREDENTIAL)).thenReturn(new GoogleIdentity(SUBJECT, "other@gmail.com", "Ana"));
        Client account = localAccount();
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.empty());
        var accountId = account.getPublicId();
        var request = GoogleLinkUpdateRequest.builder().credential(CREDENTIAL).currentPassword(PASSWORD).build();

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.linkToUser(accountId, request));

        assertEquals(400, e.getStatusCode().value());
        // Tells which email to use.
        assertTrue(e.getReason().contains(EMAIL));
        assertNull(account.getGoogleSubject());
        verify(clientRepository, never()).save(any());
    }

    @Test
    void linkToUser_comparesTheEmailsIgnoringCase() {
        when(googleTokenVerifier.verify(CREDENTIAL)).thenReturn(new GoogleIdentity(SUBJECT, EMAIL.toLowerCase(), "Ana"));
        Client account = localAccount();
        account.setEmail("Ana@Example.com");
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));
        when(clientRepository.findByGoogleSubject(SUBJECT)).thenReturn(Optional.empty());

        service.linkToUser(account.getPublicId(),
                GoogleLinkUpdateRequest.builder().credential(CREDENTIAL).currentPassword(PASSWORD).build());

        assertEquals(SUBJECT, account.getGoogleSubject());
    }

    @Test
    void linkToUser_withAWrongPassword_is400AndDoesNotEvenCheckTheToken() {
        Client account = localAccount();
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));

        expectStatus(400, () -> service.linkToUser(account.getPublicId(),
                GoogleLinkUpdateRequest.builder().credential(CREDENTIAL).currentPassword("wrong").build()));

        assertNull(account.getGoogleSubject());
    }

    @Test
    void linkToUser_whenAlreadyLinked_is400() {
        Client account = localAccount();
        account.setGoogleSubject("already");
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));

        expectStatus(400, () -> service.linkToUser(account.getPublicId(),
                GoogleLinkUpdateRequest.builder().credential(CREDENTIAL).currentPassword(PASSWORD).build()));

        assertEquals("already", account.getGoogleSubject());
    }

    @Test
    void unlinkFromUser_withTheRightPassword_clearsTheLink() {
        Client account = localAccount();
        account.setGoogleSubject(SUBJECT);
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));

        service.unlinkFromUser(account.getPublicId(), GoogleUnlinkRequest.builder().currentPassword(PASSWORD).build());

        assertNull(account.getGoogleSubject());
        verify(clientRepository).save(account);
    }

    @Test
    void unlinkFromUser_whenNotLinked_is400() {
        Client account = localAccount();
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));

        expectStatus(400, () -> service.unlinkFromUser(account.getPublicId(),
                GoogleUnlinkRequest.builder().currentPassword(PASSWORD).build()));
    }

    @Test
    void unlinkFromUser_withAWrongPassword_keepsTheLink() {
        Client account = localAccount();
        account.setGoogleSubject(SUBJECT);
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));

        expectStatus(400, () -> service.unlinkFromUser(account.getPublicId(),
                GoogleUnlinkRequest.builder().currentPassword("wrong").build()));

        assertEquals(SUBJECT, account.getGoogleSubject());
    }

    @Test
    void anAccountCreatedWithGoogle_cantBeUnlinkedNorLinkedFromTheProfile() {
        Client account = localAccount();
        account.setAuthProvider(AuthProvider.GOOGLE);
        account.setGoogleSubject(SUBJECT);
        when(clientRepository.findByPublicId(account.getPublicId())).thenReturn(Optional.of(account));

        expectStatus(400, () -> service.unlinkFromUser(account.getPublicId(),
                GoogleUnlinkRequest.builder().currentPassword(PASSWORD).build()));
        expectStatus(400, () -> service.linkToUser(account.getPublicId(),
                GoogleLinkUpdateRequest.builder().credential(CREDENTIAL).currentPassword(PASSWORD).build()));

        assertEquals(SUBJECT, account.getGoogleSubject());
    }
}
