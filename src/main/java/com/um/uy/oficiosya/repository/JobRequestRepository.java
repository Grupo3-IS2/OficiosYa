package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /** Average of the reviewed jobs' ratings; null while the professional has none. */
    @Query("SELECT AVG(j.rating) FROM JobRequest j WHERE j.professional.publicId = :professionalPublicId AND j.rating IS NOT NULL")
    Double averageRatingOf(@Param("professionalPublicId") UUID professionalPublicId);

    /** Requests made to the user as a professional that they haven't accepted or rejected yet. */
    @Query("""
            SELECT COUNT(j) FROM JobRequest j
            WHERE j.status = com.um.uy.oficiosya.entity.JobStatus.PROPOSED AND j.professional.publicId = :userPublicId
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
}
