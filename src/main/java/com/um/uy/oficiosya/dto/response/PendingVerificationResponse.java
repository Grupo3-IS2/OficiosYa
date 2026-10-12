package com.um.uy.oficiosya.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Answer to starting (or resending the code of) a registration or an email change: it is not
 * done yet, the user still has to enter the code that was mailed to {@code email}. With
 * verification turned off ({@code app.verification.enabled=false}) it is already done instead:
 * {@code verificationRequired} is false and no code was sent.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PendingVerificationResponse {
    private String email;

    /** False when verification is off and there is no code to enter: it already took effect. */
    private boolean verificationRequired;

    /** The new account's session, when a registration completed without a code. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private LoginResponse session;

    private String message;

    /** How many digits the code has, so the frontend does not hardcode it. */
    private int codeLength;

    /** How long the code stays valid, so the frontend does not hardcode it. */
    private long expiresInSeconds;

    /** How long until another code can be requested for this email. */
    private long resendCooldownSeconds;
}
