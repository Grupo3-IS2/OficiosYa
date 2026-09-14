package com.um.uy.oficiosya.validation;

import com.um.uy.oficiosya.validation.annotations.PhoneNumber;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

public class PhoneNumberValidator implements ConstraintValidator<PhoneNumber, String> {

    private static final Pattern PHONE_FORMAT = Pattern.compile("(\\+\\d{1,3})?\\d{9}");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            return true;
        }

        return PHONE_FORMAT.matcher(value).matches();
    }
}
