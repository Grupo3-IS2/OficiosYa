package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Moves to EXPIRED the proposals nobody answered in {@code JOB_PROPOSAL_EXPIRATION_HOURS} (-1: no age
 * limit), and the ones whose proposed timeframe already started, which can't be accepted anymore.
 */
@Component
@Slf4j
public class JobProposalExpiration {

    private final JobRequestRepository jobRequestRepository;
    private final JobRequestService jobRequestService;
    private final Clock clock;
    /** Null when proposals only expire by their timeframe. */
    private final Duration maxAge;

    public JobProposalExpiration(JobRequestRepository jobRequestRepository,
                                 JobRequestService jobRequestService,
                                 Clock clock,
                                 @Value("${app.job-request.proposal-expiration-hours}") long expirationHours) {
        this.jobRequestRepository = jobRequestRepository;
        this.jobRequestService = jobRequestService;
        this.clock = clock;
        this.maxAge = expirationHours < 0 ? null : Duration.ofHours(expirationHours);
    }

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT2M")
    public void expireProposals() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        // Without an age limit, a cutoff no job was created before
        OffsetDateTime createdBefore = maxAge == null ? OffsetDateTime.parse("1970-01-01T00:00:00Z") : now.minus(maxAge);

        List<Long> ids = jobRequestRepository.findProposalIdsToExpire(createdBefore, now);
        // One transaction each: a proposal answered at that same moment doesn't hold up the rest
        for (Long id : ids) {
            try {
                jobRequestService.expireProposal(id);
            } catch (RuntimeException e) {
                log.warn("Could not expire job request {}: {}", id, e.getMessage());
            }
        }
        if (!ids.isEmpty()) {
            log.info("{} job proposals checked for expiration", ids.size());
        }
    }
}
