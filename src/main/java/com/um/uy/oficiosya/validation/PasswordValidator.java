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
        REQUIREMENTS.put("una letra mayúscula", Pattern.compile("[A-Z]"));
        REQUIREMENTS.put("una letra minúscula", Pattern.compile("[a-z]"));
        REQUIREMENTS.put("un número", Pattern.compile("\\d"));
        REQUIREMENTS.put("un carácter especial", Pattern.compile("[^A-Za-z0-9]"));
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
        context.buildConstraintViolationWithTemplate("La contraseña debe tener " + String.join(", ", missingRequirements))
                .addConstraintViolation();

        return false;
    }

    static List<String> missingRequirements(String password) {
        List<String> missingRequirements = new ArrayList<>();

        if (password.length() < MIN_LENGTH) {
            missingRequirements.add("al menos " + MIN_LENGTH + " caracteres");
        }

        REQUIREMENTS.forEach((requirement, pattern) -> {
            if (!pattern.matcher(password).find()) {
                missingRequirements.add(requirement);
            }
        });

        return missingRequirements;
    }
}
