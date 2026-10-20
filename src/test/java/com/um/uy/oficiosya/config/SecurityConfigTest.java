package com.um.uy.oficiosya.config;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecurityConfigTest {

    @Test
    void allowsLocalDevelopmentAndConfiguredWebOrigins() {
        List<String> patterns = SecurityConfig.allowedOriginPatterns("oficiosya.example.com");

        assertEquals(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*",
                "https://oficiosya.example.com",
                "http://oficiosya.example.com"
        ), patterns);
    }

    @Test
    void professionalRoleIncludesClientPermissionsButAdminDoesNot() {
        var hierarchy = SecurityConfig.roleHierarchy();

        assertTrue(hierarchy.getReachableGrantedAuthorities(
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_PROFESSIONAL")))
                .stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_CLIENT")));
        assertTrue(hierarchy.getReachableGrantedAuthorities(
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ADMIN")))
                .stream()
                .noneMatch(authority -> authority.getAuthority().equals("ROLE_CLIENT")));
    }
}
