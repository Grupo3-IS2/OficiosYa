package com.um.uy.oficiosya.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Where to send the client's browser to pay on Mercado Pago. */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PaymentCheckoutResponse {
    private String initPoint;
}
