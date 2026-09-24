package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.entity.VerificationPurpose;

public interface EmailSenderService {
    /** Sends a one-time verification code to {@code to}. Throws a 503 if delivery fails. */
    void sendVerificationCode(String to, String code, VerificationPurpose purpose);
}
