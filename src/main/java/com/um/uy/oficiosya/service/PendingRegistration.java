package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Role;

/**
 * What a user filled in to register, kept as the payload of the verification code until they
 * enter it. The password is already hashed: the plain one is never stored. The email is not
 * part of it, it is the one the code was sent to.
 */
record PendingRegistration(
        Role accountType,
        String name,
        String passwordHash,
        String phoneNumber,
        String workingLocation
) {
}
