package com.um.uy.oficiosya.validation;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordValidatorTest {

    private final PasswordValidator validator = new PasswordValidator();

    @Test
    void acceptsPasswordMeetingAllRequirements() {
        assertTrue(validator.isValid("Segura1!", null));
        assertTrue(validator.isValid("UnaClave-2026", null));
    }

    @Test
    void acceptsNullAndBlankSoRequiredConstraintCanHandlePresence() {
        assertTrue(validator.isValid(null, null));
        assertTrue(validator.isValid("", null));
    }

    @Test
    void rejectsEachMissingRequirement() {
        assertTrue(PasswordValidator.missingRequirements("corta1!").contains("al menos 8 caracteres"));
        assertTrue(PasswordValidator.missingRequirements("sinmayuscula1!").contains("una letra mayúscula"));
        assertTrue(PasswordValidator.missingRequirements("SINMINUSCULA1!").contains("una letra minúscula"));
        assertTrue(PasswordValidator.missingRequirements("SinNumero!").contains("un número"));
        assertTrue(PasswordValidator.missingRequirements("SinEspecial1").contains("un carácter especial"));
    }
}
