package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Trade;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TradeRepository extends JpaRepository<Trade, Long> {
    Optional<Trade> findByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCase(String name);
}
