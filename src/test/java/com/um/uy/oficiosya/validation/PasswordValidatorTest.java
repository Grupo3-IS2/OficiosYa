package com.um.uy.oficiosya.validation;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordValidatorTest {

    private final PasswordValidator validator = new PasswordValidator();

    @Test
    void acceptsLongPasswordsWithoutCompositionRules() {
        assertTrue(validator.isValid("caballo correcto pila grapa", null));
        assertTrue(validator.isValid("todoenminusculasperolarga", null));
        assertTrue(validator.isValid("ñandú árbol camión", null));
    }

    @Test
    void acceptsNullAndBlankSoRequiredConstraintCanHandlePresence() {
        assertTrue(validator.isValid(null, null));
        assertTrue(validator.isValid("", null));
    }

    @Test
    void rejectsByLength() {
        assertTrue(PasswordValidator.problemWith("Corta1!Segura").orElseThrow().contains("al menos 15"));
        assertTrue(PasswordValidator.problemWith("a b".repeat(43)).orElseThrow().contains("como máximo 128"));
        assertTrue(PasswordValidator.problemWith("x".repeat(128) + "y").isPresent());
    }

    @Test
    void rejectsCommonLeakedAndPredictablePasswords() {
        assertTrue(PasswordValidator.problemWith("000000000000000").isPresent());
        assertTrue(PasswordValidator.problemWith("QwertyUiopAsdfg").isPresent());
        assertTrue(PasswordValidator.problemWith("MiClaveDeOficiosYa").isPresent());
        assertTrue(PasswordValidator.problemWith("zzzzzzzzzzzzzzzz").isPresent());
        assertFalse(PasswordValidator.problemWith("caballo correcto pila grapa").isPresent());
    }
}
