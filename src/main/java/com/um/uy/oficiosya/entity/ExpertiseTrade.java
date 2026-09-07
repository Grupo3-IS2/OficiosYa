package com.um.uy.oficiosya.entity;

import jakarta.persistence.*;
import lombok.*;

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
}
