package com.um.uy.oficiosya.entity;

public enum Role {
    CLIENT,
    PROFESSIONAL;

    public static Role of(User user) {
        return switch (user) {
            case Professional ignored -> PROFESSIONAL;
            case Client ignored -> CLIENT;
            default -> throw new IllegalStateException(
                    "User " + user.getPublicId() + " is neither a client nor a professional");
        };
    }
}
