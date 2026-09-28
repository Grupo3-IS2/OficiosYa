package com.um.uy.oficiosya.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.Map;

/** Body of every error the API returns. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(
        String timestamp,
        int status,
        @Schema(description = "Mensaje para mostrar al usuario")
        String error,
        @Schema(description = "Solo en errores de validación: el mensaje de cada campo inválido")
        Map<String, String> details
) {
}
