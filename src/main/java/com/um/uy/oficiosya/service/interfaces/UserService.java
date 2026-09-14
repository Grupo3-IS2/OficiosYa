package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

public interface UserService {
    UserResponse getUser(UUID id);
    UserResponse changeEmail(EmailUpdateRequest emailRequest, UUID id);
    void changePassword(PasswordUpdateRequest passwordRequest, UUID id);
    UserResponse changeProfileImage(MultipartFile image, UUID id);
    void deleteUser(UUID id);
}
