package com.um.uy.oficiosya.entity;

public enum VerificationPurpose {
    /** Activates a freshly created local account. */
    REGISTER,
    /** Confirms the new address before {@code Client.email} is actually updated. */
    EMAIL_CHANGE
}
