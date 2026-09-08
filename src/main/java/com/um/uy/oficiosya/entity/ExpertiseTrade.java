package com.um.uy.oficiosya.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Getter
@Setter
@Table(
        name = "expertise_trade",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_expertise_trade_professional_trade",
                columnNames = {"professional_id", "trade_id"}
        )
)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExpertiseTrade {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "professional_id", nullable = false)
    private Professional professional;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trade_id", nullable = false)
    private Trade trade;

    @NotNull
    @PositiveOrZero
    @Column(name = "minimum_hourly_wage", nullable = false, precision = 12, scale = 2)
    private BigDecimal minimumHourlyWage;

    @NotNull
    @PositiveOrZero
    @Column(name = "maximum_hourly_wage", nullable = false, precision = 12, scale = 2)
    private BigDecimal maximumHourlyWage;

    @Transient
    private Double tradeRating;
}
