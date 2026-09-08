package com.um.uy.oficiosya.validation;

import com.um.uy.oficiosya.validation.annotations.Password;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class PasswordValidator implements ConstraintValidator<Password, String> {

    private static final int MIN_LENGTH = 8;

    private static final Map<String, Pattern> REQUIREMENTS = new LinkedHashMap<>();

    static {
        REQUIREMENTS.put("an uppercase letter", Pattern.compile("[A-Z]"));
        REQUIREMENTS.put("a lowercase letter", Pattern.compile("[a-z]"));
        REQUIREMENTS.put("a number", Pattern.compile("\\d"));
        REQUIREMENTS.put("a special character", Pattern.compile("[^A-Za-z0-9]"));
    }

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            return true;
        }

        List<String> missingRequirements = missingRequirements(value);

        if (missingRequirements.isEmpty()) {
            return true;
        }

        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate("Password must have " + String.join(", ", missingRequirements))
                .addConstraintViolation();

        return false;
    }

    static List<String> missingRequirements(String password) {
        List<String> missingRequirements = new ArrayList<>();

        if (password.length() < MIN_LENGTH) {
            missingRequirements.add("at least " + MIN_LENGTH + " characters");
        }

        REQUIREMENTS.forEach((requirement, pattern) -> {
            if (!pattern.matcher(password).find()) {
                missingRequirements.add(requirement);
            }
        });

        return missingRequirements;
    }
}
