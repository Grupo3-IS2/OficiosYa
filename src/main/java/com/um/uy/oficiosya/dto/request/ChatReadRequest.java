package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ChatReadRequest {
    @NotNull(message = "El último mensaje leído es obligatorio")
    private Long lastReadMessageId;
}
