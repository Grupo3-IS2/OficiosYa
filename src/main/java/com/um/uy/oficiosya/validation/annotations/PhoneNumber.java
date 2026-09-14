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

    String message() default "El teléfono debe tener 9 dígitos, con prefijo internacional opcional";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
