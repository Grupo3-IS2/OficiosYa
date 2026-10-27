package com.um.uy.oficiosya.validation;

import com.um.uy.oficiosya.validation.annotations.Password;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * NIST SP 800-63B-4: length and a blocklist of common or leaked passwords, without composition rules.
 * The blocklist holds the entries of length 15 to 128 among the million most common leaked passwords (SecLists).
 */
public class PasswordValidator implements ConstraintValidator<Password, String> {

    static final int MIN_LENGTH = 15;
    static final int MAX_LENGTH = 128;

    private static final String BLOCKLIST = "/security/common-passwords.txt";
    private static final Set<String> CONTEXT_WORDS = Set.of("oficiosya", "oficios ya");
    private static final Set<String> COMMON_PASSWORDS = loadBlocklist();

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            return true;
        }

        Optional<String> problem = problemWith(value);

        if (problem.isEmpty()) {
            return true;
        }

        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(problem.get()).addConstraintViolation();

        return false;
    }

    static Optional<String> problemWith(String password) {
        String normalized = Normalizer.normalize(password, Normalizer.Form.NFKC);
        int length = normalized.codePointCount(0, normalized.length());

        if (length < MIN_LENGTH) {
            return Optional.of("La contraseña debe tener al menos " + MIN_LENGTH + " caracteres");
        }
        if (length > MAX_LENGTH) {
            return Optional.of("La contraseña puede tener como máximo " + MAX_LENGTH + " caracteres");
        }

        String lowered = normalized.toLowerCase(Locale.ROOT);
        if (COMMON_PASSWORDS.contains(lowered) || CONTEXT_WORDS.stream().anyMatch(lowered::contains)
                || lowered.codePoints().distinct().count() == 1) {
            return Optional.of("Esa contraseña es muy común o fácil de adivinar, elegí otra");
        }

        return Optional.empty();
    }

    private static Set<String> loadBlocklist() {
        InputStream stream = PasswordValidator.class.getResourceAsStream(BLOCKLIST);
        if (stream == null) {
            throw new IllegalStateException("Missing password blocklist " + BLOCKLIST);
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            return reader.lines().map(String::strip).filter(line -> !line.isEmpty()).collect(Collectors.toUnmodifiableSet());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
