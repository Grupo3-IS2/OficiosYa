package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.PasswordResetRequest;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.ClientResponse;
import com.um.uy.oficiosya.dto.update.AccountDeletionRequest;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.NotificationsUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordSetupRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.dto.update.ClientUpdateRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.exception.ClientAlreadyExists;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.mapper.ClientMapper;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@Slf4j
public class ClientServiceImpl implements ClientService {

    private static final String USER_NOT_FOUND = "Usuario no encontrado.";
    /** What a deleted account shows where its name was, in the jobs it took part in. */
    static final String DELETED_NAME = "Cuenta eliminada";
    static final String DELETED_FIELD = "-";
    /** Jobs still waiting on someone: an account can't be deleted while it has one. */
    private static final List<JobStatus> OPEN_JOB_STATUSES =
            List.of(JobStatus.PROPOSED, JobStatus.ACCEPTED, JobStatus.RESCHEDULE_REQUESTED);
    private static final String EMAIL_CHANGE_SENT = "Te enviamos un código al nuevo correo. Ingresalo para confirmar el cambio.";

    private final ClientRepository clientRepository;
    private final PasswordEncoder passwordEncoder;
    private final ClientMapper clientMapper;
    private final ProfileImageStorage profileImageStorage;
    private final EmailVerificationService emailVerificationService;
    private final EmailSenderService emailSenderService;
    private final JobRequestRepository jobRequestRepository;

    /** Off, an email change takes effect right away: no code is mailed to the new address. */
    @Value("${app.verification.enabled:true}")
    private boolean verificationEnabled = true;

    public ClientServiceImpl(ClientRepository clientRepository, PasswordEncoder passwordEncoder, ClientMapper clientMapper,
                             ProfileImageStorage profileImageStorage, EmailVerificationService emailVerificationService,
                             EmailSenderService emailSenderService, JobRequestRepository jobRequestRepository) {
        this.clientRepository = clientRepository;
        this.passwordEncoder = passwordEncoder;
        this.clientMapper = clientMapper;
        this.profileImageStorage = profileImageStorage;
        this.emailVerificationService = emailVerificationService;
        this.emailSenderService = emailSenderService;
        this.jobRequestRepository = jobRequestRepository;
    }

    @Override
    @Transactional
    public ClientResponse createUser(ClientCreateRequest userRequest, String encodedPassword) {
        if (clientRepository.existsByEmail(userRequest.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No se pudo completar el registro. Verificá los datos e intentá nuevamente.");
        }

        Client user = clientMapper.toEntity(userRequest);
        user.setPassword(encodedPassword);

        return clientMapper.toResponse(clientRepository.save(user));
    }

    @Override
    @Transactional(readOnly = true)
    public ClientResponse getUser(UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));
        return clientMapper.toResponse(user);
    }

    @Override
    @Transactional
    public ClientResponse updateUser(ClientUpdateRequest userRequest, UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        if (userRequest.getName() != null && !userRequest.getName().isBlank()) {
            user.setName(userRequest.getName());
        }

        return clientMapper.toResponse(clientRepository.save(user));
    }

    @Override
    @Transactional
    public PendingVerificationResponse startEmailChange(EmailUpdateRequest emailRequest, UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        requireOwnPassword(user);

        if (!passwordEncoder.matches(emailRequest.getCurrentPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña actual es incorrecta");
        }

        String newEmail = normalize(emailRequest.getNewEmail());

        if (newEmail.equals(normalize(user.getEmail()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nuevo email es igual al actual");
        }

        if (clientRepository.existsByEmailIgnoreCase(newEmail)) {
            throw new ClientAlreadyExists("Ya existe un usuario con el email " + newEmail);
        }

        if (!verificationEnabled) {
            user.setEmail(newEmail);
            clientRepository.save(user);
            return PendingVerificationResponse.builder().email(newEmail).verificationRequired(false).build();
        }

        emailVerificationService.sendCode(newEmail, VerificationPurpose.EMAIL_CHANGE, user.getPublicId(), null);

        return pendingResponse(newEmail, EMAIL_CHANGE_SENT);
    }

    /**
     * {@code noRollbackFor}: a wrong code throws, and without it that would undo the attempt
     * {@code verifyCode} just counted, which would make the attempt limit do nothing.
     */
    @Override
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public ClientResponse verifyEmailChange(VerifyEmailRequest request, UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        requireOwnPassword(user);

        String newEmail = normalize(request.getEmail());

        // Someone else asking for the same new address replaced the code with theirs: it is not
        // this user's to try (nor to use up the attempts of).
        requirePendingChangeOf(user, newEmail);

        emailVerificationService.verifyCode(newEmail, VerificationPurpose.EMAIL_CHANGE, request.getCode());

        if (clientRepository.existsByEmailIgnoreCase(newEmail)) {
            throw new ClientAlreadyExists("Ya existe un usuario con el email " + newEmail);
        }

        user.setEmail(newEmail);
        return clientMapper.toResponse(clientRepository.save(user));
    }

    @Override
    @Transactional
    public PendingVerificationResponse resendEmailChangeCode(ResendCodeRequest request, UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        requireOwnPassword(user);

        String newEmail = normalize(request.getEmail());

        // Only for a change that was started with the password: a resend can't be used to mail
        // codes to any address.
        requirePendingChangeOf(user, newEmail);

        emailVerificationService.sendCode(newEmail, VerificationPurpose.EMAIL_CHANGE, user.getPublicId(), null);

        return pendingResponse(newEmail, EMAIL_CHANGE_SENT);
    }

    private void requirePendingChangeOf(Client user, String newEmail) {
        boolean theirs = emailVerificationService.findPending(newEmail, VerificationPurpose.EMAIL_CHANGE)
                .map(pending -> user.getPublicId().equals(pending.userId()))
                .orElse(false);

        if (!theirs) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No hay un cambio de correo pendiente para ese correo, empezá de nuevo");
        }
    }

    private PendingVerificationResponse pendingResponse(String email, String message) {
        EmailVerificationService.VerificationTerms terms = emailVerificationService.terms();
        return PendingVerificationResponse.builder()
                .email(email)
                .verificationRequired(true)
                .message(message)
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
    public ClientResponse updateNotifications(NotificationsUpdateRequest request, UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));
        user.setEmailNotifications(request.getEmailNotifications());
        return clientMapper.toResponse(clientRepository.save(user));
    }

    @Override
    @Transactional
    public void changePassword(PasswordUpdateRequest passwordRequest, UUID id){
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

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
        clientRepository.save(user);
    }

    /**
     * Mailing again before the cooldown is the code service's 429, so "Reenviar" is just this
     * same call.
     */
    @Override
    @Transactional
    public PendingVerificationResponse startPasswordSetup(UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        requireNoPassword(user);

        if (!verificationEnabled) {
            return PendingVerificationResponse.builder().email(user.getEmail()).verificationRequired(false).build();
        }

        emailVerificationService.sendCode(user.getEmail(), VerificationPurpose.PASSWORD_SETUP, user.getPublicId(), null);

        return pendingResponse(user.getEmail(), "Te enviamos un código a tu correo. Ingresalo junto con tu nueva contraseña.");
    }

    /** {@code noRollbackFor}: as in {@link #verifyEmailChange}, a wrong code must still count as an attempt. */
    @Override
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public ClientResponse completePasswordSetup(PasswordSetupRequest request, UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        requireNoPassword(user);

        if (!request.getNewPassword().equals(request.getNewPasswordConfirmation())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La confirmación de la contraseña no coincide");
        }

        if (verificationEnabled) {
            if (request.getCode() == null || request.getCode().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ingresá el código que te enviamos por correo");
            }
            emailVerificationService.verifyCode(user.getEmail(), VerificationPurpose.PASSWORD_SETUP, request.getCode().trim());
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        user.setAuthProvider(AuthProvider.LOCAL);
        ClientResponse response = clientMapper.toResponse(clientRepository.save(user));

        // If it wasn't them, they can still get in with Google and change it.
        emailSenderService.sendNotification(user.getEmail(), "Tu cuenta de OficiosYa tiene una contraseña nueva",
                """
                Hola %s:

                Se creó una contraseña para tu cuenta de OficiosYa. Desde ahora podés iniciar sesión con tu
                correo y esa contraseña, además de con Google.

                Si no fuiste vos, entrá con Google y cambiala desde "Editar perfil".

                Equipo de OficiosYa
                """.formatted(user.getName()));

        return response;
    }

    @Override
    @Async
    public void startPasswordReset(String email) {
        try {
            clientRepository.findByEmailIgnoreCase(email)
                    // A Google account has no password to forget; a deleted one has an undeliverable address
                    .filter(user -> user.getAuthProvider() == AuthProvider.LOCAL)
                    .ifPresent(user -> emailVerificationService.sendCode(
                            user.getEmail(), VerificationPurpose.PASSWORD_RESET, user.getPublicId(), null));
        } catch (ResponseStatusException e) {
            // Inside the resend cooldown (429) or the mail server down (503): telling the caller would say the account exists
            log.info("Password reset code not sent: {}", e.getReason());
        }
    }

    @Override
    public PendingVerificationResponse passwordResetPending(String email) {
        return pendingResponse(email, "Si hay una cuenta con ese correo, te enviamos un código. Ingresalo junto con tu nueva contraseña.");
    }

    /** {@code noRollbackFor}: as in {@link #verifyEmailChange}, a wrong code must still count as an attempt. */
    @Override
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public UUID completePasswordReset(PasswordResetRequest request) {
        if (!request.getNewPassword().equals(request.getNewPasswordConfirmation())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La confirmación de la contraseña no coincide");
        }

        // An email without an account has no code either: it fails here exactly like a wrong code
        emailVerificationService.verifyCode(request.getEmail(), VerificationPurpose.PASSWORD_RESET, request.getCode().trim());

        Client user = clientRepository.findByEmailIgnoreCase(request.getEmail())
                .filter(found -> found.getAuthProvider() == AuthProvider.LOCAL)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Código incorrecto o vencido"));

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        clientRepository.save(user);

        emailSenderService.sendNotification(user.getEmail(), "Se cambió la contraseña de tu cuenta de OficiosYa",
                """
                Hola %s:

                La contraseña de tu cuenta de OficiosYa se cambió con un código enviado a este correo, y
                se cerró la sesión en todos tus dispositivos.

                Si no fuiste vos, pedí un código nuevo desde "¿Olvidaste tu contraseña?" en el inicio de
                sesión y elegí otra contraseña.

                Equipo de OficiosYa
                """.formatted(user.getName()));

        return user.getPublicId();
    }

    /** Only an account created with Google, that still has no password of its own, sets one up. */
    private void requireNoPassword(Client user) {
        if (user.getAuthProvider() != AuthProvider.GOOGLE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tu cuenta ya tiene una contraseña");
        }
    }

    /** An account created with Google has no password to confirm or to change. */
    private void requireOwnPassword(Client user) {
        if (user.getAuthProvider() == AuthProvider.GOOGLE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta usa Google para iniciar sesión, no tiene contraseña");
        }
    }

    @Override
    @Transactional
    public ClientResponse changeProfileImage(MultipartFile image, UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        String previousImageUrl = user.getProfileImageUrl();

        user.setProfileImageUrl(profileImageStorage.store(image));
        user = clientRepository.save(user);

        profileImageStorage.delete(previousImageUrl);

        return clientMapper.toResponse(user);
    }

    @Override
    @Transactional
    public ClientResponse removeProfileImage(UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        String previousImageUrl = user.getProfileImageUrl();
        user.setProfileImageUrl(null);
        user = clientRepository.save(user);

        profileImageStorage.delete(previousImageUrl);

        return clientMapper.toResponse(user);
    }

    /** Asking again is the resend: inside the cooldown the code service answers 429. */
    @Override
    @Transactional
    public PendingVerificationResponse startAccountDeletion(UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        requireNoOpenJobs(user);

        if (!verificationEnabled) {
            return PendingVerificationResponse.builder().email(user.getEmail()).verificationRequired(false).build();
        }

        emailVerificationService.sendCode(user.getEmail(), VerificationPurpose.ACCOUNT_DELETION, user.getPublicId(), null);

        return pendingResponse(user.getEmail(), "Te enviamos un código a tu correo. Ingresalo para eliminar tu cuenta.");
    }

    private void requireNoOpenJobs(Client user) {
        if (jobRequestRepository.existsForParticipantInStatus(user.getPublicId(), OPEN_JOB_STATUSES)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Tenés trabajos en curso: cancelalos o terminalos antes de eliminar tu cuenta");
        }
    }

    @Override
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public void deleteUser(AccountDeletionRequest request, UUID id) {
        Client user = clientRepository.findByPublicId(id).orElseThrow(() -> new ClientNotFoundException(USER_NOT_FOUND));

        requireDeletionConfirmed(user, request);
        requireNoOpenJobs(user);

        // Last, so a wrong password or an open job doesn't use up an attempt of the code.
        if (verificationEnabled) {
            if (request.getCode() == null || request.getCode().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ingresá el código que te enviamos por correo");
            }
            emailVerificationService.verifyCode(user.getEmail(), VerificationPurpose.ACCOUNT_DELETION, request.getCode().trim());
        }

        String imageUrl = user.getProfileImageUrl();

        user.setName(DELETED_NAME);
        // Unique and undeliverable (.invalid is reserved for that): the real address is free again.
        user.setEmail("eliminada-" + user.getPublicId() + "@oficiosya.invalid");
        user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
        user.setAuthProvider(AuthProvider.GOOGLE);
        user.setGoogleSubject(null);
        user.setProfileImageUrl(null);
        user.setEmailNotifications(false);

        if (user instanceof Professional professional) {
            professional.setPublished(false);
            // Both are required of a professional: a dash keeps nothing of theirs.
            professional.setPhoneNumber(DELETED_FIELD);
            professional.setWorkingLocation(DELETED_FIELD);
            // It can be their home.
            professional.setServiceArea(null);
            professional.setDescription(null);
            professional.getExpertiseTrades().clear();
            // Its free time goes; the slots of jobs stay with those jobs.
            professional.getSchedules().removeIf(schedule -> schedule.getType() == ScheduleType.URGENT_AVAILABLE);
        }

        clientRepository.save(user);
        profileImageStorage.delete(imageUrl);
    }

    /** The password for an account that has one; for one created with Google, its email written out. */
    private void requireDeletionConfirmed(Client user, AccountDeletionRequest request) {
        if (user.getAuthProvider() == AuthProvider.GOOGLE) {
            if (request.getEmail() == null || !normalize(request.getEmail()).equals(normalize(user.getEmail()))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escribí el correo de tu cuenta para confirmar");
            }
        } else if (request.getCurrentPassword() == null
                || !passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña actual es incorrecta");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClientResponse> listUsers() {
        return clientRepository.findAll().stream()
                .map(clientMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClientResponse> listClients() {
        return clientRepository.findClients().stream()
                .map(clientMapper::toResponse)
                .toList();
    }

}
