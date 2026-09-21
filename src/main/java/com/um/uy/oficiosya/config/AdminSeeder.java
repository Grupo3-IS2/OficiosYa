package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.entity.Admin;
import com.um.uy.oficiosya.repository.AdminRepository;
import com.um.uy.oficiosya.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the default administrator account on startup, from ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD
 * in the environment. Skipped entirely if ADMIN_PASSWORD isn't set, so no installation ever ends up
 * with a hardcoded default password; once created, it isn't touched again even if the env changes.
 */
@Slf4j
@Component
public class AdminSeeder implements CommandLineRunner {

    private final AdminRepository adminRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin.name}")
    private String adminName;

    @Value("${app.admin.email}")
    private String adminEmail;

    @Value("${app.admin.password}")
    private String adminPassword;

    public AdminSeeder(AdminRepository adminRepository, UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.adminRepository = adminRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (adminPassword == null || adminPassword.isBlank()) {
            log.warn("ADMIN_PASSWORD no está configurado: no se creó ningún administrador por defecto");
            return;
        }

        String email = adminEmail.trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            return;
        }

        Admin admin = Admin.builder()
                .name(adminName)
                .email(email)
                .password(passwordEncoder.encode(adminPassword))
                .build();

        adminRepository.save(admin);
        log.info("Administrador por defecto creado: {}", email);
    }
}
