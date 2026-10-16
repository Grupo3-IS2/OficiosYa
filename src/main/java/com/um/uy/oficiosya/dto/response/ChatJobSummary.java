package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Role;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** The job on a "Trabajo propuesto" card, as it is now; no PIN and no contact details. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatJobSummary {
    private Long id;
    private JobStatus status;
    private Role proposedBy;
    private List<TaskResponse> tasks;
    private String location;
    private BigDecimal paymentAmount;
    /**
     * The scheduled timeframe once accepted; before that (or after a rejection) the one the professional
     * proposed; null if the client proposed and nobody accepted it yet.
     */
    private OffsetDateTime start;
    private OffsetDateTime end;
    /** The timeframe asked for, while RESCHEDULE_REQUESTED. */
    private OffsetDateTime rescheduleStart;
    private OffsetDateTime rescheduleEnd;
}
