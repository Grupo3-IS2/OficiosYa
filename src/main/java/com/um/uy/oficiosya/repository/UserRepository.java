package com.um.uy.oficiosya.repository;

import com.um.uy.oficiosya.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User,Long> {
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailIgnoreCase(String email);
    Optional<User> findByPublicId(UUID publicId);
    Optional<User> findByGoogleSubject(String googleSubject);
    boolean existsByEmail(String email);
    boolean existsByEmailIgnoreCase(String email);
}
