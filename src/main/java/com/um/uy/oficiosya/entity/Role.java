package com.um.uy.oficiosya.entity;

public enum Role {
    CLIENT,
    PROFESSIONAL,
    ADMIN;

    public static Role of(User user) {
        return switch (user) {
            case Professional ignored -> PROFESSIONAL;
            case Client ignored -> CLIENT;
            case Admin ignored -> ADMIN;
            default -> throw new IllegalStateException(
                    "User " + user.getPublicId() + " is neither a client, a professional, nor an admin");
        };
    }
}
