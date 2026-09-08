package com.um.uy.oficiosya.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Entity
@Getter
@Setter
@Table(name = "task")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Task {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trade_id", nullable = false)
    private Trade trade;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_request_id")
    private JobRequest jobRequest;

    @NotBlank
    @Column(nullable = false)
    private String description;

    @Min(0)
    @Max(10)
    private Integer reviewRating;

    @Column(length = 1000)
    private String review;
}
