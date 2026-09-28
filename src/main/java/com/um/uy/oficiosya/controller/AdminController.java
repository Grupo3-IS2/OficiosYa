package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.TradeCreateRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.response.TradeResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import com.um.uy.oficiosya.service.interfaces.TradeService;
import com.um.uy.oficiosya.service.interfaces.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Oversight of the whole platform, plus catalog management. Every endpoint here requires the ADMIN role. */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final UserService userService;
    private final ClientService clientService;
    private final ProfessionalService professionalService;
    private final TradeService tradeService;
    private final JobRequestService jobRequestService;
    private final ScheduleService scheduleService;

    public AdminController(UserService userService,
                            ClientService clientService,
                            ProfessionalService professionalService,
                            TradeService tradeService,
                            JobRequestService jobRequestService,
                            ScheduleService scheduleService) {
        this.userService = userService;
        this.clientService = clientService;
        this.professionalService = professionalService;
        this.tradeService = tradeService;
        this.jobRequestService = jobRequestService;
        this.scheduleService = scheduleService;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/users")
    public ResponseEntity<List<UserResponse>> listUsers() {
        return ResponseEntity.ok(userService.listUsers());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/clients")
    public ResponseEntity<List<UserResponse>> listClients() {
        return ResponseEntity.ok(clientService.listClients());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/professionals")
    public ResponseEntity<List<ProfessionalResponse>> listProfessionals() {
        return ResponseEntity.ok(professionalService.listProfessionals());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/trades")
    public ResponseEntity<TradeResponse> createTrade(@Valid @RequestBody TradeCreateRequest tradeRequest) {
        TradeResponse trade = tradeService.createTrade(tradeRequest);
        return new ResponseEntity<>(trade, HttpStatus.CREATED);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/job-requests")
    public ResponseEntity<List<JobRequestResponse>> listJobRequests() {
        return ResponseEntity.ok(jobRequestService.listAllJobRequests());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/schedules")
    public ResponseEntity<List<ScheduleResponse>> listSchedules() {
        return ResponseEntity.ok(scheduleService.listAllSchedules());
    }
}
