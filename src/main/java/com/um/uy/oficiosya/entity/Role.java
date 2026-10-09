package com.um.uy.oficiosya.entity;

import org.hibernate.Hibernate;

public enum Role {
    CLIENT,
    PROFESSIONAL,
    ADMIN;

    /** A user that is neither a professional nor an admin is a client. */
    public static Role of(Client user) {
        // A lazy proxy is typed as Client even when the row is a Professional or an Admin
        return switch ((Client) Hibernate.unproxy(user)) {
            case Professional ignored -> PROFESSIONAL;
            case Admin ignored -> ADMIN;
            default -> CLIENT;
        };
    }
}
