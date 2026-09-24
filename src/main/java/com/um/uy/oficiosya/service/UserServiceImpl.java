package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.exception.UserAlreadyExists;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.UserMapper;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import com.um.uy.oficiosya.service.interfaces.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    private final ProfileImageStorage profileImageStorage;
    private final EmailVerificationService emailVerificationService;

    public UserServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder, UserMapper userMapper,
                           ProfileImageStorage profileImageStorage, EmailVerificationService emailVerificationService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.userMapper = userMapper;
        this.profileImageStorage = profileImageStorage;
        this.emailVerificationService = emailVerificationService;
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUser(UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));
        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public PendingVerificationResponse startEmailChange(EmailUpdateRequest emailRequest, UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        requireOwnPassword(user);

        if (!passwordEncoder.matches(emailRequest.getCurrentPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña actual es incorrecta");
        }

        String newEmail = normalize(emailRequest.getNewEmail());

        if (newEmail.equals(normalize(user.getEmail()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nuevo email es igual al actual");
        }

        if (userRepository.existsByEmailIgnoreCase(newEmail)) {
            throw new UserAlreadyExists("Ya existe un usuario con el email " + newEmail);
        }

        emailVerificationService.sendCode(newEmail, VerificationPurpose.EMAIL_CHANGE, user.getPublicId(), null);

        return pendingResponse(newEmail);
    }

    /**
     * {@code noRollbackFor}: a wrong code throws, and without it that would undo the attempt
     * {@code verifyCode} just counted, which would make the attempt limit do nothing.
     */
    @Override
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public UserResponse verifyEmailChange(VerifyEmailRequest request, UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        requireOwnPassword(user);

        String newEmail = normalize(request.getEmail());

        // Someone else asking for the same new address replaced the code with theirs: it is not
        // this user's to try (nor to use up the attempts of).
        requirePendingChangeOf(user, newEmail);

        emailVerificationService.verifyCode(newEmail, VerificationPurpose.EMAIL_CHANGE, request.getCode());

        if (userRepository.existsByEmailIgnoreCase(newEmail)) {
            throw new UserAlreadyExists("Ya existe un usuario con el email " + newEmail);
        }

        user.setEmail(newEmail);
        return userMapper.toResponse(userRepository.save(user));
    }

    @Override
    @Transactional
    public PendingVerificationResponse resendEmailChangeCode(ResendCodeRequest request, UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        requireOwnPassword(user);

        String newEmail = normalize(request.getEmail());

        // Only for a change that was started with the password: a resend can't be used to mail
        // codes to any address.
        requirePendingChangeOf(user, newEmail);

        emailVerificationService.sendCode(newEmail, VerificationPurpose.EMAIL_CHANGE, user.getPublicId(), null);

        return pendingResponse(newEmail);
    }

    private void requirePendingChangeOf(User user, String newEmail) {
        boolean theirs = emailVerificationService.findPending(newEmail, VerificationPurpose.EMAIL_CHANGE)
                .map(pending -> user.getPublicId().equals(pending.userId()))
                .orElse(false);

        if (!theirs) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No hay un cambio de correo pendiente para ese correo, empezá de nuevo");
        }
    }

    private PendingVerificationResponse pendingResponse(String email) {
        EmailVerificationService.VerificationTerms terms = emailVerificationService.terms();
        return PendingVerificationResponse.builder()
                .email(email)
                .message("Te enviamos un código al nuevo correo. Ingresalo para confirmar el cambio.")
                .codeLength(terms.codeLength())
                .expiresInSeconds(terms.expiresInSeconds())
                .resendCooldownSeconds(terms.resendCooldownSeconds())
                .build();
    }

    private String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    @Override
    @Transactional
    public void changePassword(PasswordUpdateRequest passwordRequest, UUID id){
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        requireOwnPassword(user);

        if (!passwordEncoder.matches(passwordRequest.getOldPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña actual es incorrecta");
        }

        if (!passwordRequest.getNewPassword().equals(passwordRequest.getNewPasswordConfirmation())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La confirmación de la contraseña no coincide");
        }

        if (passwordEncoder.matches(passwordRequest.getNewPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La nueva contraseña es igual a la actual");
        }

        user.setPassword(passwordEncoder.encode(passwordRequest.getNewPassword()));
        userRepository.save(user);
    }

    /** An account created with Google has no password to confirm or to change. */
    private void requireOwnPassword(User user) {
        if (user.getAuthProvider() == AuthProvider.GOOGLE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta usa Google para iniciar sesión, no tiene contraseña");
        }
    }

    @Override
    @Transactional
    public UserResponse changeProfileImage(MultipartFile image, UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        String previousImageUrl = user.getProfileImageUrl();

        user.setProfileImageUrl(profileImageStorage.store(image));
        user = userRepository.save(user);

        profileImageStorage.delete(previousImageUrl);

        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public void deleteUser(UUID id){
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));
        userRepository.delete(user);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserResponse> listUsers() {
        return userRepository.findAll().stream()
                .map(userMapper::toResponse)
                .toList();
    }

}
