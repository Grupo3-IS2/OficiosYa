package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import com.um.uy.oficiosya.entity.Role;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class JobRequestResponse {
    private Long id;
    private UUID clientId;
    private String clientName;
    private String clientProfileImageUrl;
    private UUID professionalId;
    private String professionalName;
    private String professionalProfileImageUrl;

    /** Contact details, only once the professional has accepted the job; null before that or if it fell through. */
    private String clientEmail;
    private String professionalPhoneNumber;

    private String location;
    private BigDecimal paymentAmount;
    private PaymentState paymentState;
    private JobStatus status;
    private List<TaskResponse> tasks;

    /** The timeframe the professional agreed to when accepting; null while PROPOSED, REJECTED or CANCELLED. */
    private OffsetDateTime scheduledStart;
    private OffsetDateTime scheduledEnd;

    /** The new timeframe the client asked for; only set while RESCHEDULE_REQUESTED. */
    private OffsetDateTime rescheduleStart;
    private OffsetDateTime rescheduleEnd;

    private String rejectionReason;
    /** Which side cancelled it (CLIENT or PROFESSIONAL); null unless CANCELLED. */
    private Role cancelledBy;
    private String cancellationReason;

    /** The client's review, left once the job is COMPLETED; null until then. */
    @Schema(minimum = "1", maximum = "10")
    private Integer rating;
    private String review;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    /** Only populated in the response to the client that just created the job; shown on site to confirm completion. */
    private String confirmationPin;
}
