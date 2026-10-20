package com.um.uy.oficiosya.validation;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PhoneNumberValidatorTest {

    private final PhoneNumberValidator validator = new PhoneNumberValidator();

    @Test
    void acceptsNineDigitsWithOptionalCountryPrefix() {
        assertTrue(validator.isValid("099123456", null));
        assertTrue(validator.isValid("+59899123456", null));
        assertTrue(validator.isValid("+12399123456", null));
    }

    @Test
    void acceptsNullAndBlankSoRequiredConstraintCanHandlePresence() {
        assertTrue(validator.isValid(null, null));
        assertTrue(validator.isValid(" ", null));
    }

    @Test
    void rejectsWrongLengthFormattingAndCharacters() {
        assertFalse(validator.isValid("99123456", null));
        assertFalse(validator.isValid("0991234567", null));
        assertFalse(validator.isValid("+598 99123456", null));
        assertFalse(validator.isValid("09A123456", null));
    }
}
