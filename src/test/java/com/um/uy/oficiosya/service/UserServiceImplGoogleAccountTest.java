package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.mapper.UserMapper;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** An account created with Google has no password: changing the email or the password is not for it. */
class UserServiceImplGoogleAccountTest {

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
    private final UUID id = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new UserServiceImpl(userRepository, passwordEncoder, userMapper, profileImageStorage, emailVerificationService);
        Client googleAccount = Client.builder().id(1L).publicId(id).name("Ana Pérez").email("ana@example.com")
                .password("{argon2}random").authProvider(AuthProvider.GOOGLE).googleSubject("sub").build();
        when(userRepository.findByPublicId(id)).thenReturn(Optional.of(googleAccount));
    }

    @Test
    void startEmailChange_isRejected() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.startEmailChange(
                EmailUpdateRequest.builder().newEmail("new@example.com").currentPassword("whatever").build(), id));

        assertEquals(400, e.getStatusCode().value());
        verify(userRepository, never()).save(any());
    }

    @Test
    void changePassword_isRejected() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.changePassword(
                PasswordUpdateRequest.builder().oldPassword("a").newPassword("B!1aaaaaaa")
                        .newPasswordConfirmation("B!1aaaaaaa").build(), id));

        assertEquals(400, e.getStatusCode().value());
        verify(userRepository, never()).save(any());
    }
}
