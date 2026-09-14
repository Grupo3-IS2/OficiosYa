package com.um.uy.oficiosya.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

/**
 * Exposes the API surface at:
 *   - Swagger UI:  /swagger-ui.html
 *   - OpenAPI JSON: /v3/api-docs
 */
@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "OficiosYa API",
                version = "v1",
                description = "Platform connecting clients with home-service professionals."
        ),
        security = @SecurityRequirement(name = "bearerAuth")
)
@SecurityScheme(
        name = "bearerAuth",
        type = SecuritySchemeType.HTTP,
        scheme = "bearer",
        bearerFormat = "JWT"
)
public class OpenApiConfig {
}
