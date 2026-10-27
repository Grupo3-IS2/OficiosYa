package com.um.uy.oficiosya.validation;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ServiceAreaRequest;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ServiceAreaRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void createValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        factory.close();
    }

    private static Set<String> invalidFields(Object request) {
        return validator.validate(request).stream()
                .map(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .collect(java.util.stream.Collectors.toSet());
    }

    @Test
    void acceptsAPointInUruguayWithARadiusFromOneToEightHundred() {
        assertTrue(invalidFields(new ServiceAreaRequest(-34.9058, -56.1913, 1)).isEmpty()); // Montevideo
        assertTrue(invalidFields(new ServiceAreaRequest(-30.9053, -55.5508, 800)).isEmpty()); // Rivera
        assertTrue(invalidFields(new ServiceAreaRequest(-34.9625, -54.9450, 10)).isEmpty()); // Punta del Este
    }

    @Test
    void rejectsARadiusOutOfRange() {
        assertEquals(Set.of("radiusKm"), invalidFields(new ServiceAreaRequest(-34.9, -56.2, 0)));
        assertEquals(Set.of("radiusKm"), invalidFields(new ServiceAreaRequest(-34.9, -56.2, 801)));
    }

    @Test
    void rejectsAPointOutsideUruguay() {
        assertEquals(Set.of("longitude"), invalidFields(new ServiceAreaRequest(-34.6037, -58.8, 10))); // west of Buenos Aires
        assertEquals(Set.of("latitude"), invalidFields(new ServiceAreaRequest(-29.5, -56.2, 10)));
        assertEquals(Set.of("latitude", "longitude"), invalidFields(new ServiceAreaRequest(40.4, -3.7, 10))); // Madrid
    }

    @Test
    void rejectsAnIncompleteArea() {
        assertEquals(Set.of("longitude"), invalidFields(new ServiceAreaRequest(-34.9, null, 10)));
        assertEquals(Set.of("latitude", "longitude", "radiusKm"), invalidFields(new ServiceAreaRequest(null, null, null)));
    }

    @Test
    void theRequestsValidateTheNestedAreaButDoNotRequireIt() {
        ProfessionalCreateRequest withoutArea = ProfessionalCreateRequest.builder().name("Beto Gómez")
                .email("beto@example.com").password("Clave!2026").phoneNumber("099123456")
                .workingLocation("Pocitos").build();
        Set<String> withoutAreaErrors = invalidFields(withoutArea);
        assertTrue(withoutAreaErrors.stream().noneMatch(field -> field.startsWith("serviceArea")), withoutAreaErrors.toString());

        withoutArea.setServiceArea(new ServiceAreaRequest(-34.9, -56.2, 0));
        assertTrue(invalidFields(withoutArea).contains("serviceArea.radiusKm"));

        ProfessionalUpdateRequest update = ProfessionalUpdateRequest.builder()
                .serviceArea(new ServiceAreaRequest(-34.9, null, 10)).build();
        assertTrue(invalidFields(update).contains("serviceArea.longitude"));
    }
}
