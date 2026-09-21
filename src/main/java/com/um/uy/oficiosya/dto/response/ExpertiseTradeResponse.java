package com.um.uy.oficiosya.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExpertiseTradeResponse {
    private Long id;
    private Long tradeId;
    private String tradeName;
    private BigDecimal minimumHourlyWage;
    private BigDecimal maximumHourlyWage;
}
