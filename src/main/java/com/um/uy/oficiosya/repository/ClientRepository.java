package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Client;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ClientRepository extends JpaRepository<Client, Long> {
    Optional<Client> findByPublicId(UUID publicId);
}
