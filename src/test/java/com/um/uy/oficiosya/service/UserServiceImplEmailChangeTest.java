package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.exception.UserAlreadyExists;
import com.um.uy.oficiosya.mapper.UserMapper;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService.VerificationResult;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService.VerificationTerms;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Changing the email takes a code mailed to the new address: nothing changes until it is verified. */
class UserServiceImplEmailChangeTest {

    private static final String OLD_EMAIL = "ana@example.com";
    private static final String NEW_EMAIL = "ana.nueva@example.com";
    private static final String PASSWORD = "Str0ng!Passw0rd";
    private static final String HASH = "{argon2}hash";

    @Mock
    private UserRepository userRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private UserMapper userMapper;
    @Mock
    private ProfileImageStorage profileImageStorage;
    @Mock
    private EmailVerificationService emailVerificationService;

    private UserServiceImpl service;
    private Client user;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new UserServiceImpl(userRepository, passwordEncoder, userMapper, profileImageStorage, emailVerificationService);
        user = Client.builder().id(1L).publicId(UUID.randomUUID()).name("Ana Pérez").email(OLD_EMAIL).password(HASH).build();

        when(userRepository.findByPublicId(user.getPublicId())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(PASSWORD, HASH)).thenReturn(true);
        when(emailVerificationService.terms()).thenReturn(new VerificationTerms(6, 900, 60));
        when(userRepository.save(any(Client.class))).thenAnswer(call -> call.getArgument(0));
        when(userMapper.toResponse(any())).thenAnswer(call -> {
            UserResponse response = new UserResponse();
            response.setEmail(((Client) call.getArgument(0)).getEmail());
            return response;
        });
    }

    private EmailUpdateRequest change(String newEmail, String password) {
        return EmailUpdateRequest.builder().newEmail(newEmail).currentPassword(password).build();
    }

    private void givenPending(String email, UUID ownerId) {
        when(emailVerificationService.findPending(email, VerificationPurpose.EMAIL_CHANGE))
                .thenReturn(Optional.of(new VerificationResult(ownerId, null)));
    }

    // --- start ---

    @Test
    void startEmailChange_mailsACodeToTheNewAddressAndDoesNotChangeTheEmail() {
        PendingVerificationResponse response = service.startEmailChange(change(NEW_EMAIL, PASSWORD), user.getPublicId());

        verify(emailVerificationService).sendCode(NEW_EMAIL, VerificationPurpose.EMAIL_CHANGE, user.getPublicId(), null);
        assertEquals(OLD_EMAIL, user.getEmail());
        verify(userRepository, never()).save(any());

        assertEquals(NEW_EMAIL, response.getEmail());
        assertEquals(6, response.getCodeLength());
        assertEquals(900, response.getExpiresInSeconds());
        assertEquals(60, response.getResendCooldownSeconds());
    }

    @Test
    void startEmailChange_normalizesTheNewAddress() {
        service.startEmailChange(change("  Ana.Nueva@Example.COM ", PASSWORD), user.getPublicId());

        verify(emailVerificationService).sendCode(eq(NEW_EMAIL), any(), any(), any());
    }

    @Test
    void startEmailChange_withAWrongPassword_sendsNothing() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.startEmailChange(change(NEW_EMAIL, "wrong"), user.getPublicId()));

        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), any());
    }

    @Test
    void startEmailChange_toTheSameEmail_isRejected() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.startEmailChange(change("ANA@example.com", PASSWORD), user.getPublicId()));

        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), any());
    }

    @Test
    void startEmailChange_toAnAddressThatHasAnAccount_isRejectedAndSendsNothing() {
        when(userRepository.existsByEmailIgnoreCase(NEW_EMAIL)).thenReturn(true);

        assertThrows(UserAlreadyExists.class, () -> service.startEmailChange(change(NEW_EMAIL, PASSWORD), user.getPublicId()));

        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), any());
    }

    // --- verify ---

    @Test
    void verifyEmailChange_withTheRightCode_changesTheEmail() {
        givenPending(NEW_EMAIL, user.getPublicId());

        UserResponse response = service.verifyEmailChange(
                VerifyEmailRequest.builder().email(NEW_EMAIL).code("123456").build(), user.getPublicId());

        verify(emailVerificationService).verifyCode(NEW_EMAIL, VerificationPurpose.EMAIL_CHANGE, "123456");
        assertEquals(NEW_EMAIL, user.getEmail());
        verify(userRepository).save(user);
        assertEquals(NEW_EMAIL, response.getEmail());
    }

    @Test
    void verifyEmailChange_withAWrongCode_leavesTheEmailAlone() {
        givenPending(NEW_EMAIL, user.getPublicId());
        when(emailVerificationService.verifyCode(NEW_EMAIL, VerificationPurpose.EMAIL_CHANGE, "000000"))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Código incorrecto o vencido"));

        assertThrows(ResponseStatusException.class, () -> service.verifyEmailChange(
                VerifyEmailRequest.builder().email(NEW_EMAIL).code("000000").build(), user.getPublicId()));

        assertEquals(OLD_EMAIL, user.getEmail());
        verify(userRepository, never()).save(any());
    }

    @Test
    void verifyEmailChange_forACodeThatIsAnotherUsersOrNoOne_doesNotEvenTryIt() {
        givenPending(NEW_EMAIL, UUID.randomUUID());

        assertThrows(ResponseStatusException.class, () -> service.verifyEmailChange(
                VerifyEmailRequest.builder().email(NEW_EMAIL).code("123456").build(), user.getPublicId()));

        // It must not use up somebody else's attempts.
        verify(emailVerificationService, never()).verifyCode(anyString(), any(), anyString());
        assertEquals(OLD_EMAIL, user.getEmail());

        when(emailVerificationService.findPending(NEW_EMAIL, VerificationPurpose.EMAIL_CHANGE)).thenReturn(Optional.empty());
        assertThrows(ResponseStatusException.class, () -> service.verifyEmailChange(
                VerifyEmailRequest.builder().email(NEW_EMAIL).code("123456").build(), user.getPublicId()));
        verify(emailVerificationService, never()).verifyCode(anyString(), any(), anyString());
    }

    @Test
    void verifyEmailChange_ifTheAddressWasTakenInTheMeantime_isRejected() {
        givenPending(NEW_EMAIL, user.getPublicId());
        when(userRepository.existsByEmailIgnoreCase(NEW_EMAIL)).thenReturn(true);

        assertThrows(UserAlreadyExists.class, () -> service.verifyEmailChange(
                VerifyEmailRequest.builder().email(NEW_EMAIL).code("123456").build(), user.getPublicId()));

        assertEquals(OLD_EMAIL, user.getEmail());
        verify(userRepository, never()).save(any());
    }

    @Test
    void verifyEmailChange_keepsTheCountedAttemptWhenTheCodeIsRejected() throws NoSuchMethodException {
        // A rejected code throws; without noRollbackFor the attempt it counted would be rolled back with it.
        Transactional transactional = UserServiceImpl.class
                .getMethod("verifyEmailChange", VerifyEmailRequest.class, UUID.class)
                .getAnnotation(Transactional.class);

        assertTrue(Arrays.asList(transactional.noRollbackFor()).contains(ResponseStatusException.class));
    }

    // --- resend ---

    @Test
    void resendEmailChangeCode_sendsAnotherCodeForAChangeTheUserStarted() {
        givenPending(NEW_EMAIL, user.getPublicId());

        service.resendEmailChangeCode(ResendCodeRequest.builder().email(NEW_EMAIL).build(), user.getPublicId());

        verify(emailVerificationService).sendCode(NEW_EMAIL, VerificationPurpose.EMAIL_CHANGE, user.getPublicId(), null);
    }

    @Test
    void resendEmailChangeCode_cantBeUsedToMailCodesToAnyAddress() {
        when(emailVerificationService.findPending(anyString(), any())).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> service.resendEmailChangeCode(
                ResendCodeRequest.builder().email("victima@example.com").build(), user.getPublicId()));

        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), any());
        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), isNull());
    }
}
