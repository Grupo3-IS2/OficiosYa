package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.update.ScheduleUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/schedule")
public class ScheduleController {

    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    /** Creates a block on the caller's own agenda: URGENT_AVAILABLE or USER_RESERVED only. */
    @PostMapping
    public ResponseEntity<ScheduleResponse> createSchedule(@Valid @RequestBody ScheduleCreateRequest scheduleRequest,
                                                            Authentication authentication) {
        ScheduleResponse schedule = scheduleService.createSchedule(scheduleRequest, authenticatedProfessionalId(authentication));
        return new ResponseEntity<>(schedule, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ScheduleResponse> updateSchedule(@Valid @RequestBody ScheduleUpdateRequest scheduleRequest,
                                                            @PathVariable Long id,
                                                            Authentication authentication) {
        ScheduleResponse schedule = scheduleService.updateSchedule(scheduleRequest, id, authenticatedProfessionalId(authentication));
        return ResponseEntity.ok(schedule);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSchedule(@PathVariable Long id, Authentication authentication) {
        scheduleService.deleteSchedule(id, authenticatedProfessionalId(authentication));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/professional/{professionalId}")
    public ResponseEntity<List<ScheduleResponse>> getAgenda(
            @PathVariable UUID professionalId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return ResponseEntity.ok(scheduleService.getAgenda(professionalId, from, to));
    }

    private UUID authenticatedProfessionalId(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes de iniciar sesión");
        }

        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "El token de autenticación es inválido");
        }
    }
}
