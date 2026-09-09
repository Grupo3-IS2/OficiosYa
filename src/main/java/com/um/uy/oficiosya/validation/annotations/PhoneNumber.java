package com.um.uy.oficiosya.validation.annotations;

import com.um.uy.oficiosya.validation.PhoneNumberValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Documented
@Constraint(validatedBy = PhoneNumberValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface PhoneNumber {

    String message() default "Phone number must be 9 digits, optionally preceded by an international prefix";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
