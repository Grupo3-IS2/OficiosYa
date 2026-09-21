package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
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
    private Integer rating;
    private String review;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** Only populated in the response to the client that just created the job; shown on site to confirm completion. */
    private String confirmationPin;
}
