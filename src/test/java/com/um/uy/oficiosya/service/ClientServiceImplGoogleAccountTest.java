package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordSetupRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.mapper.ClientMapper;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * An account created with Google has no password: changing the email or the password is not for it,
 * until it sets one up with a code mailed to it.
 */
class ClientServiceImplGoogleAccountTest {

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
    private EmailSenderService emailSenderService;
    @Mock
    private JobRequestRepository jobRequestRepository;

    private ClientServiceImpl service;
    private final UUID id = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ClientServiceImpl(clientRepository, passwordEncoder, clientMapper, profileImageStorage, emailVerificationService,
                emailSenderService, jobRequestRepository);
        Client googleAccount = Client.builder().id(1L).publicId(id).name("Ana Pérez").email("ana@example.com")
                .password("{argon2}random").authProvider(AuthProvider.GOOGLE).googleSubject("sub").build();
        when(clientRepository.findByPublicId(id)).thenReturn(Optional.of(googleAccount));
    }

    @Test
    void startEmailChange_isRejected() {
        var request = EmailUpdateRequest.builder().newEmail("new@example.com").currentPassword("whatever").build();
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.startEmailChange(request, id));

        assertEquals(400, e.getStatusCode().value());
        verify(clientRepository, never()).save(any());
    }

    @Test
    void changePassword_isRejected() {
        var request = PasswordUpdateRequest.builder().oldPassword("a").newPassword("B!1aaaaaaa")
                        .newPasswordConfirmation("B!1aaaaaaa").build();
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.changePassword(request, id));

        assertEquals(400, e.getStatusCode().value());
        verify(clientRepository, never()).save(any());
    }

    // --- giving it a password ---

    private PasswordSetupRequest setup(String code, String password, String confirmation) {
        return PasswordSetupRequest.builder().code(code).newPassword(password).newPasswordConfirmation(confirmation).build();
    }

    @Test
    void startPasswordSetup_mailsACodeToTheAccountsOwnEmail() {
        when(emailVerificationService.terms()).thenReturn(new EmailVerificationService.VerificationTerms(6, 900, 60));

        var pending = service.startPasswordSetup(id);

        verify(emailVerificationService).sendCode("ana@example.com", VerificationPurpose.PASSWORD_SETUP, id, null);
        assertEquals("ana@example.com", pending.getEmail());
        assertTrue(pending.isVerificationRequired());
    }

    @Test
    void completePasswordSetup_withTheCode_givesThePasswordAndTellsTheOwner() {
        when(passwordEncoder.encode("Nueva!Clave1")).thenReturn("{argon2}hash");
        when(clientRepository.save(any(Client.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.completePasswordSetup(setup(" 123456 ", "Nueva!Clave1", "Nueva!Clave1"), id);

        ArgumentCaptor<Client> saved = ArgumentCaptor.forClass(Client.class);
        verify(emailVerificationService).verifyCode("ana@example.com", VerificationPurpose.PASSWORD_SETUP, "123456");
        verify(clientRepository).save(saved.capture());
        assertEquals("{argon2}hash", saved.getValue().getPassword());
        assertEquals(AuthProvider.LOCAL, saved.getValue().getAuthProvider());
        // Google stays linked: the owner can now unlink it, with the new password.
        assertEquals("sub", saved.getValue().getGoogleSubject());
        verify(emailSenderService).sendNotification(eq("ana@example.com"), anyString(), anyString());
    }

    @Test
    void completePasswordSetup_withAWrongCode_changesNothing() {
        when(emailVerificationService.verifyCode("ana@example.com", VerificationPurpose.PASSWORD_SETUP, "000000"))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Código incorrecto o vencido"));

        assertThrows(ResponseStatusException.class,
                () -> service.completePasswordSetup(setup("000000", "Nueva!Clave1", "Nueva!Clave1"), id));

        verify(clientRepository, never()).save(any());
        verify(emailSenderService, never()).sendNotification(anyString(), anyString(), anyString());
    }

    @Test
    void completePasswordSetup_withoutACodeOrWithDifferentPasswords_isRejectedBeforeTryingTheCode() {
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.completePasswordSetup(setup(" ", "Nueva!Clave1", "Nueva!Clave1"), id)).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.completePasswordSetup(setup("123456", "Nueva!Clave1", "Otra!Clave1"), id)).getStatusCode().value());

        // A typo in the confirmation must not use up an attempt of the code.
        verify(emailVerificationService, never()).verifyCode(anyString(), any(), anyString());
        verify(clientRepository, never()).save(any());
    }

    @Test
    void passwordSetup_isNotForAnAccountThatAlreadyHasOne() {
        Client local = Client.builder().id(2L).publicId(id).email("ana@example.com").password("{argon2}own")
                .authProvider(AuthProvider.LOCAL).build();
        when(clientRepository.findByPublicId(id)).thenReturn(Optional.of(local));

        assertThrows(ResponseStatusException.class, () -> service.startPasswordSetup(id));
        assertThrows(ResponseStatusException.class,
                () -> service.completePasswordSetup(setup("123456", "Nueva!Clave1", "Nueva!Clave1"), id));

        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), any());
        verify(clientRepository, never()).save(any());
    }
}
