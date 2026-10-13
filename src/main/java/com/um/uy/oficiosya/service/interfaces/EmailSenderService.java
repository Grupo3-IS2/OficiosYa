package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.entity.VerificationPurpose;

public interface EmailSenderService {
    /** Sends a one-time verification code to {@code to}. Throws a 503 if delivery fails. */
    void sendVerificationCode(String to, String code, VerificationPurpose purpose);

    /**
     * A notice the user didn't ask for at that moment (a change of timeframe, requests piling up).
     * Unlike a verification code nothing waits on it: a failure is logged and answered with false.
     */
    boolean sendNotification(String to, String subject, String body);
}
