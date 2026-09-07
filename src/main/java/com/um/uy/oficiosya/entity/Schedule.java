package com.um.uy.oficiosya.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@Table(name = "schedule")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Schedule {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "professional_id", nullable = false)
    private Professional professional;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_request_id", unique = true)
    private JobRequest jobRequest;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ScheduleType type;

    @NotNull
    @Column(nullable = false)
    private LocalDateTime startTimestamp;

    @NotNull
    @Column(nullable = false)
    private LocalDateTime endTimestamp;
}
