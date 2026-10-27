package com.um.uy.oficiosya.dto.request;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/** The timeframe a professional picks when accepting a client's proposal; a client accepting a professional's sends no body. */
@Data
@NoArgsConstructor
public class JobRequestAcceptRequest {
    private OffsetDateTime startTimestamp;

    private OffsetDateTime endTimestamp;
}
