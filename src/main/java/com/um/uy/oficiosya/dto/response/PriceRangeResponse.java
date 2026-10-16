package com.um.uy.oficiosya.dto.response;

import java.math.BigDecimal;

/** The lowest and highest hourly rates on offer; both null when nothing matches. */
public record PriceRangeResponse(BigDecimal minimum, BigDecimal maximum) {
}
