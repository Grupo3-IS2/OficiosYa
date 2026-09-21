package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestConfirmRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/job-request")
public class JobRequestController {

    private final JobRequestService jobRequestService;

    public JobRequestController(JobRequestService jobRequestService) {
        this.jobRequestService = jobRequestService;
    }

    /** Only a client can request a job. */
    @PostMapping
    public ResponseEntity<JobRequestResponse> createJobRequest(@Valid @RequestBody JobRequestCreateRequest request,
                                                                 Authentication authentication) {
        JobRequestResponse jobRequest = jobRequestService.createJobRequest(request, authenticatedUserId(authentication));
        return new ResponseEntity<>(jobRequest, HttpStatus.CREATED);
    }

    /** Only the requested professional can accept it; this also blocks their agenda for the agreed timeframe. */
    @PostMapping("/{id}/accept")
    public ResponseEntity<JobRequestResponse> acceptJobRequest(@Valid @RequestBody JobRequestAcceptRequest request,
                                                                 @PathVariable Long id,
                                                                 Authentication authentication) {
        JobRequestResponse jobRequest = jobRequestService.acceptJobRequest(id, request, authenticatedUserId(authentication));
        return ResponseEntity.ok(jobRequest);
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<JobRequestResponse> rejectJobRequest(@PathVariable Long id, Authentication authentication) {
        JobRequestResponse jobRequest = jobRequestService.rejectJobRequest(id, authenticatedUserId(authentication));
        return ResponseEntity.ok(jobRequest);
    }

    /** Either the client or the professional can cancel it while it hasn't been completed. */
    @PostMapping("/{id}/cancel")
    public ResponseEntity<JobRequestResponse> cancelJobRequest(@PathVariable Long id, Authentication authentication) {
        JobRequestResponse jobRequest = jobRequestService.cancelJobRequest(id, authenticatedUserId(authentication));
        return ResponseEntity.ok(jobRequest);
    }

    /** The professional enters, on site, the PIN the client shows them to mark the job as completed. */
    @PostMapping("/{id}/confirm")
    public ResponseEntity<JobRequestResponse> confirmJobRequest(@Valid @RequestBody JobRequestConfirmRequest request,
                                                                  @PathVariable Long id,
                                                                  Authentication authentication) {
        JobRequestResponse jobRequest = jobRequestService.confirmJobRequest(id, request, authenticatedUserId(authentication));
        return ResponseEntity.ok(jobRequest);
    }

    /** Either party involved in the job can look it up. */
    @GetMapping("/{id}")
    public ResponseEntity<JobRequestResponse> getJobRequest(@PathVariable Long id, Authentication authentication) {
        JobRequestResponse jobRequest = jobRequestService.getJobRequest(id, authenticatedUserId(authentication));
        return ResponseEntity.ok(jobRequest);
    }

    @GetMapping("/mine/client")
    public ResponseEntity<List<JobRequestResponse>> getMyJobRequestsAsClient(Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.getJobRequestsAsClient(authenticatedUserId(authentication)));
    }

    @GetMapping("/mine/professional")
    public ResponseEntity<List<JobRequestResponse>> getMyJobRequestsAsProfessional(Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.getJobRequestsAsProfessional(authenticatedUserId(authentication)));
    }

    private UUID authenticatedUserId(Authentication authentication) {
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
