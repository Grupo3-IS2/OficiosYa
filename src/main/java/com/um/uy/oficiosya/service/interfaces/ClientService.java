package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.ClientUpdateRequest;

import java.util.List;
import java.util.UUID;

public interface ClientService {
    UserResponse createClient(ClientCreateRequest clientRequest);

    /**
     * Creates the client with a password that is already hashed; the request's own password is
     * ignored. For accounts whose data was validated and hashed earlier (a verified registration).
     */
    UserResponse createClient(ClientCreateRequest clientRequest, String encodedPassword);
    UserResponse updateClient(ClientUpdateRequest clientRequest, UUID id);
    void deleteClient(UUID id);

    /** Admin-only. */
    List<UserResponse> listClients();
}
