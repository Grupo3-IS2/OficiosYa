package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.UserRequestDTO;
import com.um.uy.oficiosya.dto.response.UserResponseDTO;

public interface UserService {
    UserResponseDTO createUser(UserRequestDTO userRequest);
    UserResponseDTO updateUser(UserRequestDTO userRequest, String email);
    void deleteUser(String email);
}
