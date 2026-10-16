package com.um.uy.oficiosya.entity;

/** How an account was created. Says nothing about whether Google is linked to it: see {@code Client.isGoogleLinked}. */
public enum AuthProvider {
    /** Has a password of its own: registered with one, or created with Google and given one later. */
    LOCAL,
    /** Created through Google and still without a password: the stored one is random and nobody knows it. */
    GOOGLE
}
