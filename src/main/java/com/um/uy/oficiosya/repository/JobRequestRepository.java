package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.JobRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface JobRequestRepository extends JpaRepository<JobRequest, Long> {
    List<JobRequest> findByClient_PublicIdOrderByCreatedAtDesc(UUID clientPublicId);
    List<JobRequest> findByProfessional_PublicIdOrderByCreatedAtDesc(UUID professionalPublicId);
}
