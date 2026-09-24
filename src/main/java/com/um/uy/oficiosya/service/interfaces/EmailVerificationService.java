package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.entity.VerificationPurpose;

import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationService {

    /**
     * What a code was issued for, handed back once it checks out. Either field can be null:
     * {@code userId} for a REGISTER code (no account yet), {@code payload} when none was given.
     */
    record VerificationResult(UUID userId, String payload) {
    }

    /** How the codes work, for the callers that tell the user (and the frontend, which doesn't hardcode them). */
    record VerificationTerms(int codeLength, long expiresInSeconds, long resendCooldownSeconds) {
    }

    VerificationTerms terms();

    /**
     * Generates a new code for {@code (email, purpose)}, mails it and stores it hashed,
     * replacing any code already pending for that same pair. Throws a 429 if the last one
     * for this pair was sent too recently (resend cooldown).
     *
     * @param userId  the user the code belongs to, if the account already exists.
     * @param payload anything the caller needs back once the code is verified (for a
     *                registration, the pending account's data). Stored as is: it must not
     *                hold anything sensitive in plain text.
     */
    void sendCode(String email, VerificationPurpose purpose, UUID userId, String payload);

    /**
     * Checks {@code code} against the pending one for {@code (email, purpose)}. On success the
     * code is consumed (single use) and what it was issued for is returned. On failure throws
     * a 400 (wrong code, none pending, expired, or attempts exhausted); either way the caller
     * has to request a new code afterward.
     *
     * <p>A failed check still persists the attempt it counted, so the attempt limit actually
     * holds. An expired or exhausted code is not deleted: it keeps rejecting, and it is what
     * {@link #findPending} reads to resend a code without asking the user to start over.
     */
    VerificationResult verifyCode(String email, VerificationPurpose purpose, String code);

    /**
     * The latest code for {@code (email, purpose)} that was never used, expired or not, for
     * whoever wants to send a new one on the same terms. Empty if there is none.
     */
    Optional<VerificationResult> findPending(String email, VerificationPurpose purpose);
}
