package com.um.uy.oficiosya.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;
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

    @NotBlank(message = "Name is necessary")
    @Column(nullable = false)
    private String name;

    @NotBlank(message = "Password is necessary")
    @Column(nullable = false)
    private String password;

    @NotBlank(message = "Email is necessary")
    @Email(message = "Invalid email")
    @Column(name = "email", unique = true, nullable = false)
    private String email;

    @Column(name = "profile_image")
    private String profileImageUrl;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    private void assignPublicId() {
        if (this.publicId == null) {
            this.publicId = UUID.randomUUID();
        }
    }
}
