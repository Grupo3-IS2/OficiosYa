package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.RefreshToken;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    /** Locked, so two exchanges of the same token at once can't both rotate it. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Modifying
    @Query("UPDATE RefreshToken t SET t.revokedAt = :now WHERE t.family = :family AND t.revokedAt IS NULL")
    void revokeFamily(@Param("family") UUID family, @Param("now") OffsetDateTime now);

    @Modifying
    @Query("UPDATE RefreshToken t SET t.revokedAt = :now WHERE t.user.publicId = :userId AND t.revokedAt IS NULL")
    void revokeAllOf(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

    void deleteByExpiresAtBefore(OffsetDateTime cutoff);
}
