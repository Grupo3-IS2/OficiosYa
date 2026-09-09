package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;

import java.util.UUID;

public interface UserService {
    UserResponse getUser(UUID id);
    UserResponse changeEmail(EmailUpdateRequest emailRequest, UUID id);
    void changePassword(PasswordUpdateRequest passwordRequest, UUID id);
    void deleteUser(UUID id);
}
