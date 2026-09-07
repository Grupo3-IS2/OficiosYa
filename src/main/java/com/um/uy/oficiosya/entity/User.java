package com.um.uy.oficiosya.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

@Entity
@Getter
@Setter
@Table(name = "users")
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "Password is necessary")
    private String name;

    @NotBlank(message = "Password is necessary")
    private String password;

    private Integer salary;

    @NotBlank(message = "Email is necessary")
    @Email(message = "Invalid email")
    @Column(name = "email", unique = true, nullable = false)
    private String email;
}
