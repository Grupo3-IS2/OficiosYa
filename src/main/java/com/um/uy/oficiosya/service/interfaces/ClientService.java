package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.ClientResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.dto.update.ClientUpdateRequest;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

public interface ClientService {
    /**
     * Creates a client account with a password that is already hashed; the request's own password is
     * ignored. For accounts whose data was validated and hashed earlier (a verified registration).
     */
    ClientResponse createUser(ClientCreateRequest userRequest, String encodedPassword);

    ClientResponse getUser(UUID id);

    /** The fields every account has, whatever its type. */
    ClientResponse updateUser(ClientUpdateRequest userRequest, UUID id);

    /**
     * First step of changing the email: checks the current password and that the new address is
     * free, and mails a code to the <em>new</em> address. The account keeps its email until
     * {@link #verifyEmailChange} gets that code, so nobody can move an account to an address
     * they can't read.
     */
    PendingVerificationResponse startEmailChange(EmailUpdateRequest emailRequest, UUID id);

    /** Second step: with the code mailed to {@code request.email} (the new address), the email changes. */
    ClientResponse verifyEmailChange(VerifyEmailRequest request, UUID id);

    /** A new code for a change that was started by this user; the previous one stops working. */
    PendingVerificationResponse resendEmailChangeCode(ResendCodeRequest request, UUID id);

    void changePassword(PasswordUpdateRequest passwordRequest, UUID id);
    ClientResponse changeProfileImage(MultipartFile image, UUID id);
    void deleteUser(UUID id);

    /** Every account regardless of type (client, professional or admin). Admin-only. */
    List<ClientResponse> listUsers();

    /** The accounts that are only clients (neither professionals nor admins). Admin-only. */
    List<ClientResponse> listClients();
}
