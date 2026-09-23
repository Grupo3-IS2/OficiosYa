package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Schedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

    @Query("""
            SELECT s FROM Schedule s
            WHERE s.professional.publicId = :professionalPublicId
            AND (CAST(:from AS LocalDateTime) IS NULL OR s.endTimestamp > :from)
            AND (CAST(:to AS LocalDateTime) IS NULL OR s.startTimestamp < :to)
            ORDER BY s.startTimestamp ASC
            """)
    List<Schedule> findAgenda(@Param("professionalPublicId") UUID professionalPublicId,
                               @Param("from") LocalDateTime from,
                               @Param("to") LocalDateTime to);

    /** excludeId lets an update check for overlaps against every block except itself; pass 0L when creating. */
    @Query("""
            SELECT COUNT(s) > 0 FROM Schedule s
            WHERE s.professional.publicId = :professionalPublicId
            AND s.id <> :excludeId
            AND s.startTimestamp < :end
            AND s.endTimestamp > :start
            """)
    boolean existsOverlapping(@Param("professionalPublicId") UUID professionalPublicId,
                               @Param("start") LocalDateTime start,
                               @Param("end") LocalDateTime end,
                               @Param("excludeId") Long excludeId);
}
