package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.update.ClientUpdateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.ClientMapper;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class ClientServiceImpl implements ClientService {

    private final ClientRepository clientRepository;
    private final UserRepository userRepository;
    private final ClientMapper clientMapper;
    private final PasswordEncoder passwordEncoder;

    public ClientServiceImpl(ClientRepository clientRepository,
                             UserRepository userRepository,
                             ClientMapper clientMapper,
                             PasswordEncoder passwordEncoder) {
        this.clientRepository = clientRepository;
        this.userRepository = userRepository;
        this.clientMapper = clientMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public UserResponse createClient(ClientCreateRequest clientRequest) {
        if (this.userRepository.existsByEmail(clientRequest.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "User with email " + clientRequest.getEmail() + " already exists");
        }

        Client client = clientMapper.toEntity(clientRequest);
        client.setPassword(this.passwordEncoder.encode(clientRequest.getPassword()));

        client = this.clientRepository.save(client);

        return clientMapper.toResponse(client);
    }

    @Override
    @Transactional
    public UserResponse updateClient(ClientUpdateRequest clientRequest, UUID id) {
        Client client = clientRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Client not found."));

        // Inherited User fields.
        if (clientRequest.getName() != null && !clientRequest.getName().isBlank()) {
            client.setName(clientRequest.getName());
        }

        if (clientRequest.getProfileImageUrl() != null) {
            client.setProfileImageUrl(clientRequest.getProfileImageUrl());
        }

        client = clientRepository.save(client);
        return clientMapper.toResponse(client);
    }

    @Override
    @Transactional
    public void deleteClient(UUID id) {
        Client client = clientRepository.findByPublicId(id)
                .orElseThrow(() -> new UserNotFoundException("Client not found."));
        clientRepository.delete(client);
    }
}
