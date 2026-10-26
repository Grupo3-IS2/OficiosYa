package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.dto.response.PriceRangeResponse;
import com.um.uy.oficiosya.entity.Professional;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProfessionalRepository extends JpaRepository<Professional, Long> {
    /** Haversine, from the centre of p's service area to (:lat, :lon); same as {@code ServiceArea.distanceKm}. */
    // Padded: text blocks drop the trailing space of the text it's concatenated to.
    String DISTANCE_KM = " " + """
            6371 * 2 * ASIN(SQRT(POWER(SIN(RADIANS(p.serviceArea.latitude - :lat) / 2), 2)
                + COS(RADIANS(:lat)) * COS(RADIANS(p.serviceArea.latitude))
                * POWER(SIN(RADIANS(p.serviceArea.longitude - :lon) / 2), 2)))""" + " ";

    Optional<Professional> findByPublicId(UUID publicId);
    boolean existsByPublicId(UUID publicId);
    boolean existsByPublicIdAndPublishedTrue(UUID publicId);

    /**
     * Locks the professional's row until the transaction ends. Every change to their agenda takes
     * this lock first, so two concurrent overlap checks can't both pass and book the same slot.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Professional p WHERE p.publicId = :publicId")
    Optional<Professional> findByPublicIdForUpdate(@Param("publicId") UUID publicId);

    /**
     * Published professionals; every filter is optional and they combine (AND). tradeIds,
     * minPrice and maxPrice are matched against the same offered trade row, so "category X
     * between $Y and $Z" means the professional has that exact combination, not each
     * independently. Available: a free block overlapping [:availableFrom, :availableTo).
     * :location and :query are cast explicitly: left untyped, Postgres can't infer a type for
     * them inside CONCAT when null and fails with "function lower(bytea) does not exist"
     * (:availableFrom likewise in its IS NULL).
     *
     * <p>With a point (:lat, :lon), a professional matches if it falls inside their service area and
     * within :maxDistanceKm. Those without a service area yet match by :location text instead, so they
     * don't vanish from searches before picking one. There is no bounding-box pre-filter: an area can
     * reach 800 km, the whole country, so a box would let everything through anyway.
     *
     * <p>Filtered with EXISTS instead of a join, so there are no duplicates to DISTINCT away: with
     * DISTINCT, Postgres refuses to order by anything not selected, like the lowest price. :order
     * is a {@code ProfessionalSearchFilters.Order} name; the Pageable must come without a sort.
     */
    @Query(value = """
            SELECT p FROM Professional p
            WHERE p.published = true
            AND ((:tradeIds IS NULL AND :minPrice IS NULL AND :maxPrice IS NULL) OR EXISTS (
                SELECT et.id FROM ExpertiseTrade et WHERE et.professional = p
                AND (:tradeIds IS NULL OR et.trade.id IN :tradeIds)
                AND (:minPrice IS NULL OR et.maximumHourlyWage >= :minPrice)
                AND (:maxPrice IS NULL OR et.minimumHourlyWage <= :maxPrice)))
            AND (:minRating IS NULL OR p.rating >= :minRating)
            AND (:location IS NULL OR (CAST(:lat AS Double) IS NOT NULL AND p.serviceArea.latitude IS NOT NULL)
                OR LOWER(p.workingLocation) LIKE LOWER(CONCAT('%', CAST(:location AS string), '%')))
            AND (CAST(:lat AS Double) IS NULL OR (p.serviceArea.latitude IS NULL AND :location IS NOT NULL) OR (
                """ + DISTANCE_KM + """
                <= LEAST(p.serviceArea.radiusKm, COALESCE(:maxDistanceKm, p.serviceArea.radiusKm))))
            AND (:query IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:query AS string), '%')))
            AND (CAST(:availableFrom AS OffsetDateTime) IS NULL OR EXISTS (
                SELECT s.id FROM Schedule s WHERE s.professional = p
                AND s.type = com.um.uy.oficiosya.entity.ScheduleType.URGENT_AVAILABLE
                AND s.startTimestamp < s.endTimestamp
                AND s.startTimestamp < :availableTo AND s.endTimestamp > :availableFrom))
            ORDER BY
                CASE WHEN :order = 'PRICE_ASC' THEN (SELECT MIN(e2.minimumHourlyWage) FROM ExpertiseTrade e2 WHERE e2.professional = p
                    AND (:tradeIds IS NULL OR e2.trade.id IN :tradeIds)) END ASC NULLS LAST,
                CASE WHEN :order = 'PRICE_DESC' THEN (SELECT MIN(e2.minimumHourlyWage) FROM ExpertiseTrade e2 WHERE e2.professional = p
                    AND (:tradeIds IS NULL OR e2.trade.id IN :tradeIds)) END DESC NULLS LAST,
                CASE WHEN :order = 'RATING_DESC' THEN p.rating END DESC NULLS LAST,
                CASE WHEN :order = 'DISTANCE' THEN """ + DISTANCE_KM + """
                END ASC NULLS LAST,
                LOWER(p.name), p.id
            """, countQuery = """
            SELECT COUNT(p) FROM Professional p
            WHERE p.published = true
            AND ((:tradeIds IS NULL AND :minPrice IS NULL AND :maxPrice IS NULL) OR EXISTS (
                SELECT et.id FROM ExpertiseTrade et WHERE et.professional = p
                AND (:tradeIds IS NULL OR et.trade.id IN :tradeIds)
                AND (:minPrice IS NULL OR et.maximumHourlyWage >= :minPrice)
                AND (:maxPrice IS NULL OR et.minimumHourlyWage <= :maxPrice)))
            AND (:minRating IS NULL OR p.rating >= :minRating)
            AND (:location IS NULL OR (CAST(:lat AS Double) IS NOT NULL AND p.serviceArea.latitude IS NOT NULL)
                OR LOWER(p.workingLocation) LIKE LOWER(CONCAT('%', CAST(:location AS string), '%')))
            AND (CAST(:lat AS Double) IS NULL OR (p.serviceArea.latitude IS NULL AND :location IS NOT NULL) OR (
                """ + DISTANCE_KM + """
                <= LEAST(p.serviceArea.radiusKm, COALESCE(:maxDistanceKm, p.serviceArea.radiusKm))))
            AND (:query IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:query AS string), '%')))
            AND (CAST(:availableFrom AS OffsetDateTime) IS NULL OR EXISTS (
                SELECT s.id FROM Schedule s WHERE s.professional = p
                AND s.type = com.um.uy.oficiosya.entity.ScheduleType.URGENT_AVAILABLE
                AND s.startTimestamp < s.endTimestamp
                AND s.startTimestamp < :availableTo AND s.endTimestamp > :availableFrom))
            """)
    Page<Professional> search(@Param("tradeIds") List<Long> tradeIds,
                               @Param("minPrice") BigDecimal minPrice,
                               @Param("maxPrice") BigDecimal maxPrice,
                               @Param("minRating") Double minRating,
                               @Param("location") String location,
                               @Param("query") String query,
                               @Param("availableFrom") OffsetDateTime availableFrom,
                               @Param("availableTo") OffsetDateTime availableTo,
                               @Param("lat") Double lat,
                               @Param("lon") Double lon,
                               @Param("maxDistanceKm") Integer maxDistanceKm,
                               @Param("order") String order,
                               Pageable pageable);

    /**
     * The hourly rates on offer among published professionals, for the price filter: of the trades
     * searched for (all, without a trade filter) and the name searched for.
     */
    @Query("""
            SELECT new com.um.uy.oficiosya.dto.response.PriceRangeResponse(MIN(et.minimumHourlyWage), MAX(et.maximumHourlyWage))
            FROM ExpertiseTrade et
            WHERE et.professional.published = true
            AND (:tradeIds IS NULL OR et.trade.id IN :tradeIds)
            AND (:query IS NULL OR LOWER(et.professional.name) LIKE LOWER(CONCAT('%', CAST(:query AS string), '%')))
            """)
    PriceRangeResponse priceRange(@Param("tradeIds") List<Long> tradeIds, @Param("query") String query);
}
