package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface JobRequestRepository extends JpaRepository<JobRequest, Long> {
    /** The jobs a user takes part in, whichever side they are on. */
    @Query("""
            SELECT j FROM JobRequest j
            WHERE j.client.publicId = :userPublicId OR j.professional.publicId = :userPublicId
            ORDER BY j.createdAt DESC
            """)
    List<JobRequest> findByParticipant(@Param("userPublicId") UUID userPublicId);

    /** Same as {@link #findByParticipant}, only the ones in the given status. */
    @Query("""
            SELECT j FROM JobRequest j
            WHERE (j.client.publicId = :userPublicId OR j.professional.publicId = :userPublicId)
            AND j.status = :status
            ORDER BY j.createdAt DESC
            """)
    List<JobRequest> findByParticipantAndStatus(@Param("userPublicId") UUID userPublicId,
                                                @Param("status") JobStatus status);

    /** Whether the user takes part, on either side, in a job that is in one of these statuses. */
    @Query("""
            SELECT COUNT(j) > 0 FROM JobRequest j
            WHERE (j.client.publicId = :userPublicId OR j.professional.publicId = :userPublicId)
            AND j.status IN :statuses
            """)
    boolean existsForParticipantInStatus(@Param("userPublicId") UUID userPublicId,
                                         @Param("statuses") Collection<JobStatus> statuses);

    /** Average of the reviewed jobs' ratings; null while the professional has none. */
    @Query("SELECT AVG(j.rating) FROM JobRequest j WHERE j.professional.publicId = :professionalPublicId AND j.rating IS NOT NULL")
    Double averageRatingOf(@Param("professionalPublicId") UUID professionalPublicId);

    @Query("""
            SELECT j FROM JobRequest j
            WHERE j.professional.publicId = :professionalPublicId AND j.rating IS NOT NULL
            ORDER BY j.updatedAt DESC
            """)
    Page<JobRequest> findReviewsOfProfessional(@Param("professionalPublicId") UUID professionalPublicId, Pageable pageable);

    @Query("""
            SELECT j FROM JobRequest j
            WHERE j.client.publicId = :clientPublicId AND j.rating IS NOT NULL
            ORDER BY j.updatedAt DESC
            """)
    Page<JobRequest> findReviewsByClient(@Param("clientPublicId") UUID clientPublicId, Pageable pageable);

    /** Proposals the other side made to the user that they haven't accepted or rejected yet. */
    @Query("""
            SELECT COUNT(j) FROM JobRequest j
            WHERE j.status = com.um.uy.oficiosya.entity.JobStatus.PROPOSED
            AND ((j.professional.publicId = :userPublicId AND j.proposedBy = com.um.uy.oficiosya.entity.Role.CLIENT)
              OR (j.client.publicId = :userPublicId AND j.proposedBy = com.um.uy.oficiosya.entity.Role.PROFESSIONAL))
            """)
    long countProposalsAwaitingAnswerFrom(@Param("userPublicId") UUID userPublicId);

    /**
     * Changes of timeframe the other side asked of the user, still unanswered. One with no requester
     * comes from before either side could ask: it was the client's, so the professional answers it.
     */
    @Query("""
            SELECT COUNT(j) FROM JobRequest j
            WHERE j.status = com.um.uy.oficiosya.entity.JobStatus.RESCHEDULE_REQUESTED
            AND ((j.client.publicId = :userPublicId
                  AND j.rescheduleRequestedBy = com.um.uy.oficiosya.entity.Role.PROFESSIONAL)
              OR (j.professional.publicId = :userPublicId
                  AND (j.rescheduleRequestedBy IS NULL OR j.rescheduleRequestedBy = com.um.uy.oficiosya.entity.Role.CLIENT)))
            """)
    long countReschedulesAwaitingAnswerFrom(@Param("userPublicId") UUID userPublicId);

    /** The jobs between two users (by id), whichever side each one is on. */
    @Query("""
            SELECT j FROM JobRequest j
            WHERE (j.client.id = :userId AND j.professional.id = :otherUserId)
            OR (j.client.id = :otherUserId AND j.professional.id = :userId)
            """)
    List<JobRequest> findBetween(@Param("userId") Long userId, @Param("otherUserId") Long otherUserId);

    /** Accepted jobs still unpaid whose agreed start is before the given time. */
    @Query("""
            SELECT DISTINCT j FROM JobRequest j JOIN j.schedules s
            WHERE j.status IN (com.um.uy.oficiosya.entity.JobStatus.ACCEPTED, com.um.uy.oficiosya.entity.JobStatus.RESCHEDULE_REQUESTED)
            AND j.paymentState = com.um.uy.oficiosya.entity.PaymentState.PENDING
            AND s.type = com.um.uy.oficiosya.entity.ScheduleType.SCHEDULED_JOB
            AND s.startTimestamp < :before
            """)
    List<JobRequest> findUnpaidStartingBefore(@Param("before") OffsetDateTime before);

    /** Jobs whose payment was released by the PIN but whose professional wasn't transferred yet, oldest first. */
    List<JobRequest> findByPaymentStateAndPayoutAtIsNullOrderByUpdatedAtAsc(PaymentState paymentState);

    List<JobRequest> findByPayoutAtIsNotNullOrderByPayoutAtDesc();

    /** With CANCELLED and RETAINED: the jobs whose money an admin still has to give back, oldest first. */
    List<JobRequest> findByStatusAndPaymentStateOrderByUpdatedAtAsc(JobStatus status, PaymentState paymentState);

    List<JobRequest> findByPaymentStateOrderByUpdatedAtDesc(PaymentState paymentState);

    /** The professional's Mercado Pago accounts that open jobs, or refunds still to make, depend on. */
    @Query("""
            SELECT DISTINCT j.mpCollectorUserId FROM JobRequest j
            WHERE j.professional.publicId = :professionalPublicId AND j.mpCollectorUserId IS NOT NULL
            AND ((j.status IN (com.um.uy.oficiosya.entity.JobStatus.ACCEPTED, com.um.uy.oficiosya.entity.JobStatus.RESCHEDULE_REQUESTED)
                  AND j.paymentState IN (com.um.uy.oficiosya.entity.PaymentState.PENDING, com.um.uy.oficiosya.entity.PaymentState.RETAINED))
              OR (j.status = com.um.uy.oficiosya.entity.JobStatus.CANCELLED
                  AND j.paymentState = com.um.uy.oficiosya.entity.PaymentState.RETAINED))
            """)
    List<String> findOpenCollectors(@Param("professionalPublicId") UUID professionalPublicId);
}
