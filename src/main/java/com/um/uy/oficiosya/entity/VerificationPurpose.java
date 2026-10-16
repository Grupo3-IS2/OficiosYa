package com.um.uy.oficiosya.entity;

public enum VerificationPurpose {
    /** Activates a freshly created local account. */
    REGISTER,
    /** Confirms the new address before {@code Client.email} is actually updated. */
    EMAIL_CHANGE,
    /** Proves the owner of an account created with Google before it gets a password of its own. */
    PASSWORD_SETUP,
    /** Confirms, with the account's own email, that its owner wants it deleted. */
    ACCOUNT_DELETION
}
