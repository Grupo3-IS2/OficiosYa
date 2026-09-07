package com.um.uy.oficiosya.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
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
@Table(name = "professional")
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class Professional extends User {
    @NotBlank
    @Column(nullable = false)
    private String workingLocation;

    @NotBlank
    private String phoneNumber;

    @Builder.Default
    @OneToMany(mappedBy = "professional")
    private List<JobRequest> jobs = new ArrayList<>();

    @Builder.Default
    @OneToMany(mappedBy = "professional", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Schedule> schedules = new ArrayList<>();

    @Builder.Default
    @OneToMany(mappedBy = "professional", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ExpertiseTrade> expertiseTrades = new ArrayList<>();
}
