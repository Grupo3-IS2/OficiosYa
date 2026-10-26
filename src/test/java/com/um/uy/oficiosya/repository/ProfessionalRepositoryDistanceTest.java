package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.ServiceArea;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.PageRequest;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The search by distance, against a real Postgres: it relies on SQL functions (ASIN, RADIANS, LEAST)
 * an in-memory database may not have or may compute differently. Skipped where Docker isn't available.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
class ProfessionalRepositoryDistanceTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    // Plaza Independencia, Montevideo; Carrasco is ~12.4 km east of it.
    private static final double PLAZA_LAT = -34.9058;
    private static final double PLAZA_LON = -56.1913;
    private static final double CARRASCO_LAT = -34.8838;
    private static final double CARRASCO_LON = -56.0581;

    @Autowired
    private ProfessionalRepository repository;

    @BeforeEach
    void setUp() {
        save("Ana Lejos", "Ciudad Vieja", new ServiceArea(PLAZA_LAT, PLAZA_LON, 20));   // reaches Carrasco
        save("Beto Corto", "Ciudad Vieja", new ServiceArea(PLAZA_LAT, PLAZA_LON, 5));   // doesn't
        save("Carla Cerca", "Carrasco", new ServiceArea(CARRASCO_LAT, CARRASCO_LON, 3)); // right there
        save("Dani Viejo", "Carrasco", null);                                            // no point yet
    }

    private void save(String name, String location, ServiceArea area) {
        repository.save(Professional.builder().name(name).email(name.replace(' ', '.') + "@example.com")
                .password("x").phoneNumber("099123456").workingLocation(location).serviceArea(area)
                .published(true).build());
    }

    private List<String> search(String location, Double lat, Double lon, Integer maxDistanceKm, String order) {
        return repository.search(null, null, null, null, location, null, null, null, lat, lon, maxDistanceKm, order,
                        PageRequest.of(0, 10))
                .map(Professional::getName).getContent();
    }

    @Test
    void aPoint_matchesTheAreasCoveringIt() {
        assertEquals(List.of("Ana Lejos", "Carla Cerca"), search(null, CARRASCO_LAT, CARRASCO_LON, null, "RELEVANCE"));
    }

    @Test
    void aMaximumDistance_dropsThoseWhoReachButAreFar() {
        assertEquals(List.of("Carla Cerca"), search(null, CARRASCO_LAT, CARRASCO_LON, 10, "RELEVANCE"));
    }

    @Test
    void withoutAServiceArea_theLocationTextStillMatches() {
        assertEquals(List.of("Ana Lejos", "Carla Cerca", "Dani Viejo"),
                search("carrasco", CARRASCO_LAT, CARRASCO_LON, null, "RELEVANCE"));
    }

    @Test
    void nearestFirst_leavesThoseWithoutAServiceAreaLast() {
        assertEquals(List.of("Carla Cerca", "Ana Lejos", "Dani Viejo"),
                search("carrasco", CARRASCO_LAT, CARRASCO_LON, null, "DISTANCE"));
    }

    @Test
    void withoutAPoint_nothingIsFilteredByDistance() {
        assertEquals(4, search(null, null, null, null, "RELEVANCE").size());
        assertEquals(List.of("Carla Cerca", "Dani Viejo"), search("carrasco", null, null, null, "RELEVANCE"));
    }
}
