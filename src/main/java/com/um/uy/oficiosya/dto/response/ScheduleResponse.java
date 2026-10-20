package com.um.uy.oficiosya.dto.response;

import com.um.uy.oficiosya.entity.ScheduleType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScheduleResponse {
    private Long id;
    private UUID professionalId;
    private Long jobRequestId;
    private ScheduleType type;
    private OffsetDateTime startTimestamp;
    private OffsetDateTime endTimestamp;
    private String rrule;
    private String tzid;
    private List<OffsetDateTime> exdates;
    private OffsetDateTime recurrenceEnd;

    public ScheduleResponse(Long id, UUID professionalId, Long jobRequestId, ScheduleType type,
                            OffsetDateTime startTimestamp, OffsetDateTime endTimestamp) {
        this.id = id;
        this.professionalId = professionalId;
        this.jobRequestId = jobRequestId;
        this.type = type;
        this.startTimestamp = startTimestamp;
        this.endTimestamp = endTimestamp;
    }
}
