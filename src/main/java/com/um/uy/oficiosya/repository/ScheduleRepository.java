package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Schedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

    @Query("""
            SELECT s FROM Schedule s
            WHERE s.professional.publicId = :professionalPublicId
            AND (CAST(:to AS OffsetDateTime) IS NULL OR s.startTimestamp < :to)
            ORDER BY s.startTimestamp ASC
            """)
    List<Schedule> findAgenda(@Param("professionalPublicId") UUID professionalPublicId,
                               @Param("to") OffsetDateTime to);

    /** excludeId lets an update check for overlaps against every block except itself; pass 0L when creating. */
    @Query("""
            SELECT s FROM Schedule s
            WHERE s.professional.publicId = :professionalPublicId
            AND s.id <> :excludeId
            AND (CAST(:end AS OffsetDateTime) IS NULL OR s.startTimestamp < :end)
            ORDER BY s.startTimestamp ASC
            """)
    List<Schedule> findBeforeEndExcluding(@Param("professionalPublicId") UUID professionalPublicId,
                                          @Param("end") OffsetDateTime end,
                                          @Param("excludeId") Long excludeId);
}
