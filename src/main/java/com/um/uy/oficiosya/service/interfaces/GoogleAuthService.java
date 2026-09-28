package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.GoogleCredentialRequest;
import com.um.uy.oficiosya.dto.request.GoogleLinkRequest;
import com.um.uy.oficiosya.dto.request.GoogleProfessionalRegisterRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.GoogleLinkUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleUnlinkRequest;

import java.util.UUID;

/**
 * Signing in and registering with Google. Linking Google to an account that has a password is
 * always the user's choice and needs that password: it never happens on its own.
 */
public interface GoogleAuthService {

    /**
     * Logs in an account already linked to this Google account. Throws a 409 if the email
     * belongs to an account that has a password but is not linked (the user can then choose to
     * {@link #link}), and a 404 if there is no account for that email.
     */
    LoginResponse login(GoogleCredentialRequest request);

    /** The user's "yes, link it": checks the account's password, links Google to it and logs in. */
    LoginResponse link(GoogleLinkRequest request);

    LoginResponse registerClient(GoogleCredentialRequest request);

    LoginResponse registerProfessional(GoogleProfessionalRegisterRequest request);

    /** From the profile: links Google to the logged-in user's account. The Google account must have the account's own email. */
    UserResponse linkToUser(UUID userId, GoogleLinkUpdateRequest request);

    /** From the profile: unlinks Google. Only for accounts with a password of their own. */
    UserResponse unlinkFromUser(UUID userId, GoogleUnlinkRequest request);
}
