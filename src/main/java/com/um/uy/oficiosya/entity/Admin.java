package com.um.uy.oficiosya.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Entity
@Table(name = "admin")
@SuperBuilder
@NoArgsConstructor
public class Admin extends User {
}
