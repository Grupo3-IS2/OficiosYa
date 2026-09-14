package com.um.uy.oficiosya.validation;

import com.um.uy.oficiosya.validation.annotations.FullName;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

public class FullNameValidator implements ConstraintValidator<FullName, String> {

    private static final Pattern NAME_FORMAT = Pattern.compile("\\p{L}+( \\p{L}+)+");

    private static final int MIN_LENGTH = 3;

    private static final int MAX_LENGTH = 100;

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            return true;
        }

        return value.length() >= MIN_LENGTH
                && value.length() <= MAX_LENGTH
                && NAME_FORMAT.matcher(value).matches();
    }
}
