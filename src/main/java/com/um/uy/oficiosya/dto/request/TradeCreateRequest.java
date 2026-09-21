package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class TradeCreateRequest {
    @NotBlank(message = "El nombre del oficio es obligatorio")
    private String name;
}
