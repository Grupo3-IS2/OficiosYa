package com.um.uy.oficiosya.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** A Client that is neither a Professional nor an Admin has the CLIENT role. */
class RoleTest {

    @Test
    void of_aPlainClient_isAClient() {
        assertEquals(Role.CLIENT, Role.of(Client.builder().build()));
    }

    @Test
    void of_aProfessional_isAProfessional() {
        assertEquals(Role.PROFESSIONAL, Role.of(Professional.builder().build()));
    }

    @Test
    void of_anAdmin_isAnAdmin() {
        assertEquals(Role.ADMIN, Role.of(Admin.builder().build()));
    }
}
