package com.um.uy.oficiosya.dto.update;

import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/** Partial update (PATCH): a null field keeps its current value. */
@Data
@NoArgsConstructor
public class ScheduleUpdateRequest {
    private OffsetDateTime startTimestamp;
    private OffsetDateTime endTimestamp;
    @JsonAlias("rrule_text")
    private String rruleText;
}
