package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.GoogleCredentialRequest;
import com.um.uy.oficiosya.dto.request.GoogleLinkRequest;
import com.um.uy.oficiosya.dto.request.GoogleProfessionalRegisterRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.ClientResponse;
import com.um.uy.oficiosya.dto.update.GoogleLinkUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleUnlinkRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.exception.ClientNotFoundException;
import com.um.uy.oficiosya.mapper.ClientMapper;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.GoogleTokenVerifier;
import com.um.uy.oficiosya.service.interfaces.GoogleTokenVerifier.GoogleIdentity;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import com.um.uy.oficiosya.service.interfaces.ClientService;
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
    private final ClientRepository clientRepository;
    private final PasswordEncoder passwordEncoder;
    private final ClientService clientService;
    private final ProfessionalService professionalService;
    private final JwtService jwtService;
    private final ClientMapper clientMapper;

    /** Compared against when there is no account, so a missing one takes as long to answer as a wrong password. */
    private final String dummyPasswordHash;

    public GoogleAuthServiceImpl(GoogleTokenVerifier googleTokenVerifier, ClientRepository clientRepository,
                                 PasswordEncoder passwordEncoder, ClientService clientService,
                                 ProfessionalService professionalService, JwtService jwtService,
                                 ClientMapper clientMapper) {
        this.googleTokenVerifier = googleTokenVerifier;
        this.clientRepository = clientRepository;
        this.passwordEncoder = passwordEncoder;
        this.clientService = clientService;
        this.professionalService = professionalService;
        this.jwtService = jwtService;
        this.clientMapper = clientMapper;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Override
    public LoginResponse login(GoogleCredentialRequest request) {
        GoogleIdentity identity = googleTokenVerifier.verify(request.getCredential());

        Client linked = clientRepository.findByGoogleSubject(identity.subject()).orElse(null);
        if (linked != null) {
            return loginResponseFor(linked, "inició sesión con Google correctamente");
        }

        Client sameEmail = clientRepository.findByEmailIgnoreCase(identity.email()).orElseThrow(() ->
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

        Client user = clientRepository.findByEmailIgnoreCase(identity.email()).orElse(null);

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

        ClientResponse created = clientService.createUser(
                ClientCreateRequest.builder().name(displayName(identity)).email(identity.email()).build(),
                unusablePasswordHash());

        return googleAccountLoginResponse(created, identity);
    }

    @Override
    @Transactional
    public LoginResponse registerProfessional(GoogleProfessionalRegisterRequest request) {
        GoogleIdentity identity = googleTokenVerifier.verify(request.getCredential());
        requireNoAccountFor(identity);

        ClientResponse created = professionalService.createProfessional(
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
    public ClientResponse linkToUser(UUID userId, GoogleLinkUpdateRequest request) {
        Client user = clientRepository.findByPublicId(userId)
                .orElseThrow(() -> new ClientNotFoundException("Usuario no encontrado."));

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

        return clientMapper.toResponse(user);
    }

    @Override
    @Transactional
    public ClientResponse unlinkFromUser(UUID userId, GoogleUnlinkRequest request) {
        Client user = clientRepository.findByPublicId(userId)
                .orElseThrow(() -> new ClientNotFoundException("Usuario no encontrado."));

        requireCurrentPassword(user, request.getCurrentPassword());

        if (!user.isGoogleLinked()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta no está vinculada con Google");
        }

        user.setGoogleSubject(null);
        return clientMapper.toResponse(clientRepository.save(user));
    }

    /**
     * For accounts with a password of their own. One created with Google has none: it could be
     * neither confirmed nor left without its only way in, so it never gets past here.
     */
    private void requireCurrentPassword(Client user, String currentPassword) {
        if (user.getAuthProvider() == AuthProvider.GOOGLE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta usa Google para iniciar sesión, no tiene contraseña");
        }
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña actual es incorrecta");
        }
    }

    private void linkSubject(Client user, GoogleIdentity identity) {
        if (user.isGoogleLinked() && !identity.subject().equals(user.getGoogleSubject())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tu cuenta ya está vinculada con otra cuenta de Google");
        }

        clientRepository.findByGoogleSubject(identity.subject())
                .filter(other -> !other.getId().equals(user.getId()))
                .ifPresent(other -> {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Esa cuenta de Google ya está vinculada a otra cuenta");
                });

        user.setGoogleSubject(identity.subject());
        clientRepository.save(user);
    }

    private void requireNoAccountFor(GoogleIdentity identity) {
        if (clientRepository.findByGoogleSubject(identity.subject()).isPresent()
                || clientRepository.existsByEmailIgnoreCase(identity.email())) {
            throw couldNotComplete();
        }
    }

    /** The account was just created with a random password; this marks it as Google's and links it. */
    private LoginResponse googleAccountLoginResponse(ClientResponse created, GoogleIdentity identity) {
        Client user = clientRepository.findByPublicId(created.getId())
                .orElseThrow(() -> new IllegalStateException("The account just created is missing"));

        user.setAuthProvider(AuthProvider.GOOGLE);
        user.setGoogleSubject(identity.subject());
        clientRepository.save(user);

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

    private LoginResponse loginResponseFor(Client user, String action) {
        return new LoginResponse(
                user.getPublicId(),
                jwtService.generateToken(user),
                user.getEmail(),
                user.getName(),
                Role.of(user),
                "Usuario " + user.getEmail() + " " + action);
    }
}
