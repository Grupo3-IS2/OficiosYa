package com.um.uy.oficiosya.entity;

/** How an account was created. Says nothing about whether Google is linked to it: see {@code User.isGoogleLinked}. */
public enum AuthProvider {
    /** Registered with an email and a password of its own. */
    LOCAL,
    /** Created through Google: the stored password is random and nobody knows it. */
    GOOGLE
}
