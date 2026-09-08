package com.um.uy.oficiosya.validation.annotations;

import com.um.uy.oficiosya.validation.FullNameValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Documented
@Constraint(validatedBy = FullNameValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface FullName {

    String message() default "Full name must be at least two words, with letters and single spaces only";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
