package com.um.uy.oficiosya.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
public class ConversationCreateRequest {
    @NotNull(message = "El profesional es obligatorio")
    private UUID professionalId;
}
