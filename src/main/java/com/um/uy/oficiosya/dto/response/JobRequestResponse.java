package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
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
    private UUID professionalId;
    private String location;
    private BigDecimal paymentAmount;
    private PaymentState paymentState;
    private JobStatus status;
    private List<TaskResponse> tasks;

    /** The timeframe the professional agreed to when accepting; null while PROPOSED, REJECTED or CANCELLED. */
    private OffsetDateTime scheduledStart;
    private OffsetDateTime scheduledEnd;

    /** The client's review, left once the job is COMPLETED; null until then. */
    @Schema(minimum = "1", maximum = "10")
    private Integer rating;
    private String review;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    /** Only populated in the response to the client that just created the job; shown on site to confirm completion. */
    private String confirmationPin;
}
