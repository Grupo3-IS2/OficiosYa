package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.config.ViewerAccess;
import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.update.ScheduleUpdateRequest;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/schedules")
public class ScheduleController {

    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    /** Creates a block on the caller's own agenda: URGENT_AVAILABLE or USER_RESERVED only. */
    @PostMapping
    public ResponseEntity<ScheduleResponse> createSchedule(@Valid @RequestBody ScheduleCreateRequest scheduleRequest,
                                                            Authentication authentication) {
        ScheduleResponse schedule = scheduleService.createSchedule(scheduleRequest, AuthenticatedUser.id(authentication));
        return new ResponseEntity<>(schedule, HttpStatus.CREATED);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ScheduleResponse> updateSchedule(@Valid @RequestBody ScheduleUpdateRequest scheduleRequest,
                                                            @PathVariable Long id,
                                                            Authentication authentication) {
        ScheduleResponse schedule = scheduleService.updateSchedule(scheduleRequest, id, AuthenticatedUser.id(authentication));
        return ResponseEntity.ok(schedule);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSchedule(@PathVariable Long id, Authentication authentication) {
        scheduleService.deleteSchedule(id, AuthenticatedUser.id(authentication));
        return ResponseEntity.noContent().build();
    }

    /** Public agenda of a professional. The owner and admins also see which job each block belongs to. */
    @SecurityRequirements
    @GetMapping
    public ResponseEntity<List<ScheduleResponse>> getAgenda(
            @RequestParam UUID professionalId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            Authentication authentication) {
        boolean ownerOrAdmin = ViewerAccess.isOwnerOrAdmin(authentication, professionalId);
        return ResponseEntity.ok(scheduleService.getAgenda(professionalId, from, to, ownerOrAdmin));
    }

    /** Exports a professional's agenda in RFC 5545 iCalendar (VCALENDAR) format. */
    @SecurityRequirements
    @GetMapping(value = "/ical", produces = "text/calendar;charset=UTF-8")
    public ResponseEntity<String> exportAgendaICalendar(
            @RequestParam UUID professionalId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            Authentication authentication) {
        boolean ownerOrAdmin = ViewerAccess.isOwnerOrAdmin(authentication, professionalId);
        String ics = scheduleService.exportAgendaICalendar(professionalId, from, to, ownerOrAdmin);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/calendar;charset=UTF-8"))
                .body(ics);
    }
}
