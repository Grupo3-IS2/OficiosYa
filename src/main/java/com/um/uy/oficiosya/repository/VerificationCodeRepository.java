package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.VerificationCode;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface VerificationCodeRepository extends JpaRepository<VerificationCode, Long> {
    Optional<VerificationCode> findTopByEmailIgnoreCaseAndPurposeOrderByCreatedAtDesc(
            String email, VerificationPurpose purpose);

    void deleteByEmailIgnoreCaseAndPurpose(String email, VerificationPurpose purpose);

    void deleteByExpiresAtBefore(LocalDateTime cutoff);
}
