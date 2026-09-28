package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.GoogleCredentialRequest;
import com.um.uy.oficiosya.dto.request.GoogleLinkRequest;
import com.um.uy.oficiosya.dto.request.GoogleProfessionalRegisterRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.GoogleLinkUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleUnlinkRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.UserMapper;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.GoogleTokenVerifier;
import com.um.uy.oficiosya.service.interfaces.GoogleTokenVerifier.GoogleIdentity;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
@Slf4j
public class GoogleAuthServiceImpl implements GoogleAuthService {

    private static final int MAX_NAME_LENGTH = 100;

    private final GoogleTokenVerifier googleTokenVerifier;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ClientService clientService;
    private final ProfessionalService professionalService;
    private final JwtService jwtService;
    private final UserMapper userMapper;

    /** Compared against when there is no account, so a missing one takes as long to answer as a wrong password. */
    private final String dummyPasswordHash;

    public GoogleAuthServiceImpl(GoogleTokenVerifier googleTokenVerifier, UserRepository userRepository,
                                 PasswordEncoder passwordEncoder, ClientService clientService,
                                 ProfessionalService professionalService, JwtService jwtService,
                                 UserMapper userMapper) {
        this.googleTokenVerifier = googleTokenVerifier;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.clientService = clientService;
        this.professionalService = professionalService;
        this.jwtService = jwtService;
        this.userMapper = userMapper;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Override
    public LoginResponse login(GoogleCredentialRequest request) {
        GoogleIdentity identity = googleTokenVerifier.verify(request.getCredential());

        User linked = userRepository.findByGoogleSubject(identity.subject()).orElse(null);
        if (linked != null) {
            return loginResponseFor(linked, "inició sesión con Google correctamente");
        }

        User sameEmail = userRepository.findByEmailIgnoreCase(identity.email()).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No encontramos una cuenta con ese correo, registrate primero"));

        if (sameEmail.isGoogleLinked()) {
            // Linked to a different Google account: not this one's to take.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ese correo tiene la cuenta vinculada a otra cuenta de Google");
        }

        // An account with a password of its own: linking is the user's call, and needs that password.
        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Ya existe una cuenta con este correo. Confirmá tu contraseña si querés vincularla con Google");
    }

    @Override
    @Transactional
    public LoginResponse link(GoogleLinkRequest request) {
        GoogleIdentity identity = googleTokenVerifier.verify(request.getCredential());

        User user = userRepository.findByEmailIgnoreCase(identity.email()).orElse(null);

        String hash = user == null ? dummyPasswordHash : user.getPassword();
        if (!passwordEncoder.matches(request.getPassword(), hash) || user == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Contraseña incorrecta");
        }

        linkSubject(user, identity);

        return loginResponseFor(user, "vinculó su cuenta con Google correctamente");
    }

    @Override
    @Transactional
    public LoginResponse registerClient(GoogleCredentialRequest request) {
        GoogleIdentity identity = googleTokenVerifier.verify(request.getCredential());
        requireNoAccountFor(identity);

        UserResponse created = clientService.createClient(
                ClientCreateRequest.builder().name(displayName(identity)).email(identity.email()).build(),
                unusablePasswordHash());

        return googleAccountLoginResponse(created, identity);
    }

    @Override
    @Transactional
    public LoginResponse registerProfessional(GoogleProfessionalRegisterRequest request) {
        GoogleIdentity identity = googleTokenVerifier.verify(request.getCredential());
        requireNoAccountFor(identity);

        UserResponse created = professionalService.createProfessional(
                ProfessionalCreateRequest.builder()
                        .name(displayName(identity))
                        .email(identity.email())
                        .phoneNumber(request.getPhoneNumber())
                        .workingLocation(request.getWorkingLocation())
                        .build(),
                unusablePasswordHash());

        return googleAccountLoginResponse(created, identity);
    }

    @Override
    @Transactional
    public UserResponse linkToUser(UUID userId, GoogleLinkUpdateRequest request) {
        User user = userRepository.findByPublicId(userId)
                .orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        requireCurrentPassword(user, request.getCurrentPassword());

        if (user.isGoogleLinked()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta ya está vinculada con Google");
        }

        GoogleIdentity identity = googleTokenVerifier.verify(request.getCredential());

        // The same rule as linking from the login: a Google with another email would leave the account
        // linked to something its owner can't tell from the profile, and would block that Google from
        // registering or signing in as itself.
        if (!identity.email().equalsIgnoreCase(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Esa cuenta de Google usa otro correo. Elegí la cuenta de Google con el correo de tu cuenta: "
                            + user.getEmail());
        }

        linkSubject(user, identity);

        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public UserResponse unlinkFromUser(UUID userId, GoogleUnlinkRequest request) {
        User user = userRepository.findByPublicId(userId)
                .orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        requireCurrentPassword(user, request.getCurrentPassword());

        if (!user.isGoogleLinked()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta no está vinculada con Google");
        }

        user.setGoogleSubject(null);
        return userMapper.toResponse(userRepository.save(user));
    }

    /**
     * For accounts with a password of their own. One created with Google has none: it could be
     * neither confirmed nor left without its only way in, so it never gets past here.
     */
    private void requireCurrentPassword(User user, String currentPassword) {
        if (user.getAuthProvider() == AuthProvider.GOOGLE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta usa Google para iniciar sesión, no tiene contraseña");
        }
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña actual es incorrecta");
        }
    }

    private void linkSubject(User user, GoogleIdentity identity) {
        if (user.isGoogleLinked() && !identity.subject().equals(user.getGoogleSubject())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta ya está vinculada con otra cuenta de Google");
        }

        userRepository.findByGoogleSubject(identity.subject())
                .filter(other -> !other.getId().equals(user.getId()))
                .ifPresent(other -> {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Esa cuenta de Google ya está vinculada a otra cuenta");
                });

        user.setGoogleSubject(identity.subject());
        userRepository.save(user);
    }

    private void requireNoAccountFor(GoogleIdentity identity) {
        if (userRepository.findByGoogleSubject(identity.subject()).isPresent()
                || userRepository.existsByEmailIgnoreCase(identity.email())) {
            throw couldNotComplete();
        }
    }

    /** The account was just created with a random password; this marks it as Google's and links it. */
    private LoginResponse googleAccountLoginResponse(UserResponse created, GoogleIdentity identity) {
        User user = userRepository.findByPublicId(created.getId())
                .orElseThrow(() -> new IllegalStateException("The account just created is missing"));

        user.setAuthProvider(AuthProvider.GOOGLE);
        user.setGoogleSubject(identity.subject());
        userRepository.save(user);

        return loginResponseFor(user, "registrado con Google correctamente");
    }

    private String unusablePasswordHash() {
        return passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /** Google's name is not held to the name rules of the form (it can be a single word); it just can't be empty. */
    private String displayName(GoogleIdentity identity) {
        String name = identity.name() == null ? "" : identity.name().trim();
        if (name.isEmpty()) {
            name = identity.email().substring(0, identity.email().indexOf('@'));
        }
        return name.length() > MAX_NAME_LENGTH ? name.substring(0, MAX_NAME_LENGTH) : name;
    }

    private ResponseStatusException couldNotComplete() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "No se pudo completar el registro. Verificá los datos e intentá nuevamente.");
    }

    private LoginResponse loginResponseFor(User user, String action) {
        return new LoginResponse(
                user.getPublicId(),
                jwtService.generateToken(user),
                user.getEmail(),
                user.getName(),
                Role.of(user),
                "Usuario " + user.getEmail() + " " + action);
    }
}
