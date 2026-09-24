package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.PendingRegistrationResponse;

/**
 * Registration in two steps: the data is validated and a code is mailed, and the account is
 * only created once the user enters that code. Until then nothing exists in {@code users}.
 */
public interface RegistrationService {

    /**
     * Mails a verification code and keeps the registration pending. If the email already
     * belongs to an account it answers exactly the same and sends nothing, so this cannot be
     * used to find out which emails are registered.
     */
    PendingRegistrationResponse startRegistration(ClientCreateRequest request);

    PendingRegistrationResponse startRegistration(ProfessionalCreateRequest request);

    /** Checks the code, creates the account and logs the user in. */
    LoginResponse verifyEmail(VerifyEmailRequest request);

    /**
     * Mails a new code for a registration that is still pending. With nothing pending (or an
     * account already there) it answers the same and does nothing, for the same reason as
     * {@link #startRegistration(ClientCreateRequest)}.
     */
    PendingRegistrationResponse resendCode(ResendCodeRequest request);
}
