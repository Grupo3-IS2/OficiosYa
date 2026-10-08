package com.um.uy.oficiosya.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@Setter
@Table(name = "job_request")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobRequest {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "professional_id", nullable = false)
    private Professional professional;

    @Builder.Default
    @OneToMany(mappedBy = "jobRequest", fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Task> tasks = new ArrayList<>();

    @Builder.Default
    @OneToMany(mappedBy = "jobRequest", fetch = FetchType.LAZY)
    private List<Schedule> schedules = new ArrayList<>();

    @NotBlank
    @Column(nullable = false)
    private String location;

    @NotNull
    @PositiveOrZero
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal paymentAmount;

    /** Hash of the PIN the client shows on site; never store the PIN itself. */
    @Column(nullable = false)
    private String confirmationPinHash;

    @Builder.Default
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private PaymentState paymentState = PaymentState.PENDING;

    @Builder.Default
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private JobStatus status = JobStatus.PROPOSED;

    @Column(length = 500)
    private String rejectionReason;

    /** Which side cancelled the job; null unless it is CANCELLED. */
    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private Role cancelledBy;

    @Column(length = 500)
    private String cancellationReason;

    /** The timeframe the client asked to move the job to; only set while RESCHEDULE_REQUESTED. */
    private OffsetDateTime rescheduleStart;
    private OffsetDateTime rescheduleEnd;

    @Min(1)
    @Max(10)
    private Integer rating;

    @Column(length = 1000)
    private String review;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    /**
     * With this two actions on the same job at once (accept vs. cancel, say) can't both win.
     */
    @Version
    @ColumnDefault("0")
    @Column(nullable = false)
    private Long version;

    public void clearReschedule() {
        this.rescheduleStart = null;
        this.rescheduleEnd = null;
    }
}
