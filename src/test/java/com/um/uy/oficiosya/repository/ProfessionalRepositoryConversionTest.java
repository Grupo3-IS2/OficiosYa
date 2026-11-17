package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * A client becoming a professional, against a real Postgres: the professional row is inserted by
 * hand, so its columns must match the schema Hibernate generates. Skipped where Docker isn't available.
 */
// ChatContentConverter is a JPA converter, so the context needs a key; dev-only, same as .env.example.
@DataJpaTest(properties = "app.chat.encryption-key=ZGV2LW9ubHktY2hhdC1rZXktZG8tbm90LXVzZS0zMmI=")
@Testcontainers(disabledWithoutDocker = true)
class ProfessionalRepositoryConversionTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @Autowired
    private ClientRepository clients;

    @Autowired
    private ProfessionalRepository professionals;

    @Test
    void addProfessionalRow_makesTheClientAnUnpublishedProfessionalKeepingTheAccount() {
        Client client = clients.saveAndFlush(Client.builder().name("Ana Cliente").email("ana@example.com").password("x").build());

        professionals.addProfessionalRow(client.getId(), "099123456", "Montevideo");

        Professional professional = professionals.findByPublicId(client.getPublicId()).orElseThrow();
        assertEquals(client.getId(), professional.getId());
        assertEquals("Ana Cliente", professional.getName());
        assertEquals("099123456", professional.getPhoneNumber());
        assertEquals("Montevideo", professional.getWorkingLocation());
        assertFalse(professional.isPublished());
        assertEquals(Role.PROFESSIONAL, Role.of(clients.findByPublicId(client.getPublicId()).orElseThrow()));
    }
}
