package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JobProposalExpirationTest {

    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 14, 12, 0, 0, 0, ZoneOffset.UTC);

    private final JobRequestRepository repository = mock(JobRequestRepository.class);
    private final JobRequestService service = mock(JobRequestService.class);
    private final Clock clock = Clock.fixed(Instant.from(NOW), ZoneOffset.UTC);

    @Test
    void expiresProposalsOlderThanTheLimitOrWhoseTimeframePassed_eachOnItsOwn() {
        when(repository.findProposalIdsToExpire(NOW.minusHours(72), NOW)).thenReturn(List.of(1L, 2L));
        when(service.expireProposal(1L)).thenThrow(new IllegalStateException("answered at the same time"));

        new JobProposalExpiration(repository, service, clock, 72).expireProposals();

        verify(service).expireProposal(2L);
    }

    @Test
    void withMinusOne_onlyTheTimeframeCounts() {
        new JobProposalExpiration(repository, service, clock, -1).expireProposals();

        verify(repository).findProposalIdsToExpire(OffsetDateTime.parse("1970-01-01T00:00:00Z"), NOW);
    }
}
