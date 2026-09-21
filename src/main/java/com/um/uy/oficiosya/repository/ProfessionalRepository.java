package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Professional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProfessionalRepository extends JpaRepository<Professional, Long> {
    Optional<Professional> findByPublicId(UUID publicId);
    boolean existsByPublicId(UUID publicId);

    /**
     * Published professionals; every filter is optional and they combine (AND). tradeIds,
     * minPrice and maxPrice are matched against the same offered trade row, so "category X
     * between $Y and $Z" means the professional has that exact combination, not each
     * independently. :location and :query are cast explicitly: left untyped, Postgres can't
     * infer a type for them inside CONCAT when null and fails with "function lower(bytea) does
     * not exist".
     */
    @Query("""
            SELECT DISTINCT p FROM Professional p
            LEFT JOIN p.expertiseTrades et
            WHERE p.published = true
            AND (:tradeIds IS NULL OR et.trade.id IN :tradeIds)
            AND (:minPrice IS NULL OR et.maximumHourlyWage >= :minPrice)
            AND (:maxPrice IS NULL OR et.minimumHourlyWage <= :maxPrice)
            AND (:minRating IS NULL OR p.rating >= :minRating)
            AND (:location IS NULL OR LOWER(p.workingLocation) LIKE LOWER(CONCAT('%', CAST(:location AS string), '%')))
            AND (:query IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:query AS string), '%')))
            """)
    Page<Professional> search(@Param("tradeIds") List<Long> tradeIds,
                               @Param("minPrice") BigDecimal minPrice,
                               @Param("maxPrice") BigDecimal maxPrice,
                               @Param("minRating") Double minRating,
                               @Param("location") String location,
                               @Param("query") String query,
                               Pageable pageable);
}
