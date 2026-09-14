package com.um.uy.oficiosya.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@Setter
@Table(name = "client")
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class Client extends User {
    @Builder.Default
    @OneToMany(mappedBy = "client")
    private List<JobRequest> jobsRequested = new ArrayList<>();
}
