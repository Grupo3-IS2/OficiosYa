package com.um.uy.oficiosya.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Getter
@Setter
@Table(name = "users")
@Inheritance(strategy = InheritanceType.JOINED)
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Public identifier, the one the API exposes. **/
    @Column(name = "public_id", unique = true, nullable = false, updatable = false)
    private UUID publicId;

    @NotBlank(message = "El nombre es obligatorio")
    @Column(nullable = false)
    private String name;

    @NotBlank(message = "La contraseña es obligatoria")
    @Column(nullable = false)
    private String password;

    @NotBlank(message = "El email es obligatorio")
    @Email(message = "El email no es válido")
    @Column(name = "email", unique = true, nullable = false)
    private String email;

    /** How the account came to be: with its own password, or through Google (which has none). */
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @ColumnDefault("'LOCAL'")
    @Column(name = "auth_provider", nullable = false, length = 20)
    private AuthProvider authProvider = AuthProvider.LOCAL;

    /** Google's stable id for the linked Google account (the {@code sub} claim); null if not linked. */
    @Column(name = "google_subject", unique = true)
    private String googleSubject;

    @Column(name = "profile_image")
    private String profileImageUrl;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public boolean isGoogleLinked() {
        return googleSubject != null;
    }

    @PrePersist
    @PreUpdate
    private void normalizeFields() {
        if (this.publicId == null) {
            this.publicId = UUID.randomUUID();
        }
        if (this.email != null) {
            this.email = this.email.trim().toLowerCase();
        }
    }
}
