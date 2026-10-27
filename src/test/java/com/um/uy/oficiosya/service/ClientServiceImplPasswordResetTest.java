package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.PasswordResetRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.mapper.ClientMapper;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService.VerificationResult;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** A forgotten password is replaced with a code mailed to the account, without saying which emails have one. */
class ClientServiceImplPasswordResetTest {

    private static final String EMAIL = "ana@example.com";
    private static final String NEW_PASSWORD = "ClaveNueva2026!";

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
    private Client user;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ClientServiceImpl(clientRepository, passwordEncoder, clientMapper, profileImageStorage, emailVerificationService,
                emailSenderService, jobRequestRepository);
        user = Client.builder().id(1L).publicId(UUID.randomUUID()).name("Ana Pérez").email(EMAIL).password("{argon2}old").build();
    }

    private PasswordResetRequest reset(String confirmation) {
        return PasswordResetRequest.builder().email(EMAIL).code("123456").newPassword(NEW_PASSWORD)
                .newPasswordConfirmation(confirmation).build();
    }

    @Test
    void start_withAPasswordAccount_mailsACodeToIt() {
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(user));

        service.startPasswordReset(EMAIL);

        verify(emailVerificationService).sendCode(EMAIL, VerificationPurpose.PASSWORD_RESET, user.getPublicId(), null);
    }

    @Test
    void start_withoutAnAccount_sendsNothing() {
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.empty());

        service.startPasswordReset(EMAIL);

        verifyNoInteractions(emailVerificationService);
    }

    @Test
    void start_withAGoogleAccount_sendsNothing() {
        user.setAuthProvider(AuthProvider.GOOGLE);
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(user));

        service.startPasswordReset(EMAIL);

        verifyNoInteractions(emailVerificationService);
    }

    @Test
    void start_insideTheCooldown_failsSilently() {
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(user));
        doThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS)).when(emailVerificationService)
                .sendCode(anyString(), any(), any(), isNull());

        assertDoesNotThrow(() -> service.startPasswordReset(EMAIL));
    }

    @Test
    void complete_withTheRightCode_setsThePasswordAndTellsTheOwner() {
        when(emailVerificationService.verifyCode(EMAIL, VerificationPurpose.PASSWORD_RESET, "123456"))
                .thenReturn(new VerificationResult(user.getPublicId(), null));
        when(clientRepository.findByEmailIgnoreCase(EMAIL)).thenReturn(Optional.of(user));
        when(passwordEncoder.encode(NEW_PASSWORD)).thenReturn("{argon2}new");

        UUID id = service.completePasswordReset(reset(NEW_PASSWORD));

        assertEquals(user.getPublicId(), id);
        assertEquals("{argon2}new", user.getPassword());
        verify(clientRepository).save(user);
        verify(emailSenderService).sendNotification(eq(EMAIL), anyString(), anyString());
    }

    @Test
    void complete_withAWrongCode_changesNothing() {
        when(emailVerificationService.verifyCode(EMAIL, VerificationPurpose.PASSWORD_RESET, "123456"))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Código incorrecto o vencido"));

        assertThrows(ResponseStatusException.class, () -> service.completePasswordReset(reset(NEW_PASSWORD)));

        verify(clientRepository, never()).save(any());
        assertEquals("{argon2}old", user.getPassword());
    }

    @Test
    void complete_withAMismatchedConfirmation_isRejectedBeforeSpendingAnAttempt() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.completePasswordReset(reset("OtraClaveSegura2026!")));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(emailVerificationService);
    }
}
