package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.JobRequest;
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

    /** Average of the reviewed jobs' ratings; null while the professional has none. */
    @Query("SELECT AVG(j.rating) FROM JobRequest j WHERE j.professional.publicId = :professionalPublicId AND j.rating IS NOT NULL")
    Double averageRatingOf(@Param("professionalPublicId") UUID professionalPublicId);
}
