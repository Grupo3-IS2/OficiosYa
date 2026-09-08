package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Professional;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ProfessionalRepository extends JpaRepository<Professional, Long> {
    Optional<Professional> findByPublicId(UUID publicId);
}
