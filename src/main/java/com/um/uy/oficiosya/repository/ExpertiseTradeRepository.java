package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.ExpertiseTrade;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExpertiseTradeRepository extends JpaRepository<ExpertiseTrade, Long> {
    List<ExpertiseTrade> findByProfessional_PublicId(UUID professionalPublicId);
    Optional<ExpertiseTrade> findByIdAndProfessional_PublicId(Long id, UUID professionalPublicId);
    boolean existsByProfessional_PublicIdAndTrade_Id(UUID professionalPublicId, Long tradeId);
}
