package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.Client;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClientRepository extends JpaRepository<Client,Long> {
    Optional<Client> findByEmail(String email);
    Optional<Client> findByEmailIgnoreCase(String email);
    Optional<Client> findByPublicId(UUID publicId);
    Optional<Client> findByGoogleSubject(String googleSubject);
    boolean existsByEmail(String email);
    boolean existsByEmailIgnoreCase(String email);

    /** The accounts that are only clients: neither professionals nor admins. */
    @Query("SELECT u FROM Client u WHERE TYPE(u) = Client")
    List<Client> findClients();
}
