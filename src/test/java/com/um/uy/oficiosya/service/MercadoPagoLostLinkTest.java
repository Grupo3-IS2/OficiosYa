package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.awaitility.Awaitility.await;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The link is noticed lost inside a transaction that then fails: forgetting it must survive that rollback.
 * Against a real Postgres, as it depends on real transactions. Skipped where Docker isn't available.
 */
@DataJpaTest(properties = {
        "app.chat.encryption-key=ZGV2LW9ubHktY2hhdC1rZXktZG8tbm90LXVzZS0zMmI=",
        "app.notifications.site-url=https://dev.oficiosya.uy"})
@Import({MercadoPagoAccountLink.class, MercadoPagoLostLinkTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Testcontainers(disabledWithoutDocker = true)
class MercadoPagoLostLinkTest {

    static class Config {
        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }
    }

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @MockitoBean
    private EmailSenderService emailSender;

    @Autowired
    private ProfessionalRepository repository;
    @Autowired
    private JobRequestRepository jobRequests;
    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private PlatformTransactionManager transactions;

    private Professional linkedProfessional() {
        UUID id = UUID.randomUUID();
        return repository.save(Professional.builder().publicId(id).name("Ana").email(id + "@correo.com").password("x")
                .phoneNumber("099123456").workingLocation("Montevideo")
                .payoutMpUserId("987").mpAccessToken("encrypted").mpRefreshToken("encrypted").build());
    }

    @Test
    void aLinkLostInATransactionThatRollsBack_isStillForgotten() {
        UUID id = linkedProfessional().getPublicId();

        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            events.publishEvent(new MercadoPagoAccountLink.LinkLost(id, "987"));
            throw new IllegalStateException("the refund failed");
        }));

        // On its own thread (@Async), once the rollback is over
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> {
            Professional professional = repository.findByPublicId(id).orElseThrow();
            assertNull(professional.getPayoutMpUserId());
            assertNull(professional.getMpAccessToken());
        });
    }

    private void job(Professional professional, JobStatus status, PaymentState paymentState, String collector) {
        jobRequests.save(JobRequest.builder().client(professional).professional(professional).location("Centro")
                .paymentAmount(BigDecimal.TEN).status(status).paymentState(paymentState).mpCollectorUserId(collector).build());
    }

    @Test
    void onlyOpenJobsChargedIntoAnAccount_holdIt() {
        Professional professional = linkedProfessional();
        UUID id = professional.getPublicId();
        job(professional, JobStatus.COMPLETED, PaymentState.PAID, "1");
        job(professional, JobStatus.CANCELLED, PaymentState.PENDING, "2");
        job(professional, JobStatus.CANCELLED, PaymentState.REFUNDED, "3");
        job(professional, JobStatus.ACCEPTED, PaymentState.RETAINED, null);
        assertEquals(List.of(), jobRequests.findOpenCollectors(id));

        job(professional, JobStatus.ACCEPTED, PaymentState.RETAINED, "987");
        job(professional, JobStatus.RESCHEDULE_REQUESTED, PaymentState.PENDING, "987");
        assertEquals(List.of("987"), jobRequests.findOpenCollectors(id));

        // Cancelled but not given back yet: refunding it still needs that account
        job(professional, JobStatus.CANCELLED, PaymentState.RETAINED, "111");
        assertEquals(Set.of("987", "111"), Set.copyOf(jobRequests.findOpenCollectors(id)));
    }
}
