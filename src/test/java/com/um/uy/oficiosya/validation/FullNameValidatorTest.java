package com.um.uy.oficiosya.validation;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FullNameValidatorTest {

    private final FullNameValidator validator = new FullNameValidator();

    @Test
    void acceptsTwoWordsWithUnicodeLetters() {
        assertTrue(validator.isValid("Ana Pérez", null));
        assertTrue(validator.isValid("João da Silva", null));
    }

    @Test
    void acceptsNullAndBlankSoRequiredConstraintCanHandlePresence() {
        assertTrue(validator.isValid(null, null));
        assertTrue(validator.isValid("   ", null));
    }

    @Test
    void rejectsMissingSecondWordAndInvalidCharacters() {
        assertFalse(validator.isValid("Ana", null));
        assertFalse(validator.isValid("Ana  Pérez", null));
        assertFalse(validator.isValid("Ana-Pérez", null));
        assertFalse(validator.isValid("Ana 123", null));
    }

    @Test
    void rejectsValuesOutsideLengthLimits() {
        assertFalse(validator.isValid("A".repeat(101) + " B", null));
    }
}
