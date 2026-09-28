package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

public interface UserService {
    UserResponse getUser(UUID id);

    /**
     * First step of changing the email: checks the current password and that the new address is
     * free, and mails a code to the <em>new</em> address. The account keeps its email until
     * {@link #verifyEmailChange} gets that code, so nobody can move an account to an address
     * they can't read.
     */
    PendingVerificationResponse startEmailChange(EmailUpdateRequest emailRequest, UUID id);

    /** Second step: with the code mailed to {@code request.email} (the new address), the email changes. */
    UserResponse verifyEmailChange(VerifyEmailRequest request, UUID id);

    /** A new code for a change that was started by this user; the previous one stops working. */
    PendingVerificationResponse resendEmailChangeCode(ResendCodeRequest request, UUID id);

    void changePassword(PasswordUpdateRequest passwordRequest, UUID id);
    UserResponse changeProfileImage(MultipartFile image, UUID id);
    void deleteUser(UUID id);

    /** Every account regardless of type (client, professional or admin). Admin-only. */
    List<UserResponse> listUsers();
}
