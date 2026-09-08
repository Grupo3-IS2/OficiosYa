package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.ClientUpdateRequest;

import java.util.UUID;

public interface ClientService {
    UserResponse createClient(ClientCreateRequest clientRequest);
    UserResponse updateClient(ClientUpdateRequest clientRequest, UUID id);
    void deleteClient(UUID id);
}
