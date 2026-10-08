package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Optional body of a rejection. */
@Data
@NoArgsConstructor
public class JobRequestRejectRequest {
    @Size(max = 500, message = "El motivo no puede superar los 500 caracteres")
    private String reason;
}
