package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCancelRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRejectRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRescheduleRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;

/**
 * Lifecycle: PROPOSED → accept → ACCEPTED → complete (PIN) → COMPLETED → review.
 * From PROPOSED it can also be rejected, and from PROPOSED or ACCEPTED cancelled.
 * Once ACCEPTED the client can ask to reschedule (→ RESCHEDULE_REQUESTED); the professional's
 * answer takes it back to ACCEPTED, at the new time or the original one.
 */
@RestController
@RequestMapping("/api/v1/job-requests")
public class JobRequestController {

    private final JobRequestService jobRequestService;

    public JobRequestController(JobRequestService jobRequestService) {
        this.jobRequestService = jobRequestService;
    }

    /**
     * Any client can request a job, professionals included (to someone else). The response is the only
     * place the confirmation PIN ever appears.
     */
    @PreAuthorize("hasRole('CLIENT')")
    @PostMapping
    public ResponseEntity<JobRequestResponse> createJobRequest(@Valid @RequestBody JobRequestCreateRequest request,
                                                                 Authentication authentication) {
        JobRequestResponse jobRequest = jobRequestService.createJobRequest(request, AuthenticatedUser.id(authentication));
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(jobRequest.getId())
                .toUri();
        return ResponseEntity.created(location).body(jobRequest);
    }

    /** Only the requested professional can accept it; this also blocks their agenda for the agreed timeframe. */
    @PostMapping("/{id}/accept")
    public ResponseEntity<JobRequestResponse> acceptJobRequest(@Valid @RequestBody JobRequestAcceptRequest request,
                                                                 @PathVariable Long id,
                                                                 Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.acceptJobRequest(id, request, AuthenticatedUser.id(authentication)));
    }

    /** The body, with an optional reason, can be left out. */
    @PostMapping("/{id}/reject")
    public ResponseEntity<JobRequestResponse> rejectJobRequest(@Valid @RequestBody(required = false) JobRequestRejectRequest request,
                                                                 @PathVariable Long id,
                                                                 Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.rejectJobRequest(id, request, AuthenticatedUser.id(authentication)));
    }

    /**
     * Either the client or the professional can cancel it while it hasn't been completed; once accepted,
     * only with enough notice. The body, with an optional reason, can be left out.
     */
    @PostMapping("/{id}/cancel")
    public ResponseEntity<JobRequestResponse> cancelJobRequest(@Valid @RequestBody(required = false) JobRequestCancelRequest request,
                                                                 @PathVariable Long id,
                                                                 Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.cancelJobRequest(id, request, AuthenticatedUser.id(authentication)));
    }

    /** The client proposes a new timeframe for an accepted job; the professional has to approve it. */
    @PostMapping("/{id}/reschedule")
    public ResponseEntity<JobRequestResponse> requestReschedule(@Valid @RequestBody JobRequestRescheduleRequest request,
                                                                  @PathVariable Long id,
                                                                  Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.requestReschedule(id, request, AuthenticatedUser.id(authentication)));
    }

    @PostMapping("/{id}/reschedule/accept")
    public ResponseEntity<JobRequestResponse> acceptReschedule(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.acceptReschedule(id, AuthenticatedUser.id(authentication)));
    }

    @PostMapping("/{id}/reschedule/reject")
    public ResponseEntity<JobRequestResponse> rejectReschedule(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.rejectReschedule(id, AuthenticatedUser.id(authentication)));
    }

    /** The professional enters, on site, the PIN the client shows them; this moves the job to COMPLETED. */
    @PostMapping("/{id}/complete")
    public ResponseEntity<JobRequestResponse> completeJobRequest(@Valid @RequestBody JobRequestCompleteRequest request,
                                                                   @PathVariable Long id,
                                                                   Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.completeJobRequest(id, request, AuthenticatedUser.id(authentication)));
    }

    /**
     * The client rates a COMPLETED job, once. The professional's rating is recalculated from these reviews.
     * A professional who requested the job is its client here too (PROFESSIONAL implies CLIENT).
     */
    @PreAuthorize("hasRole('CLIENT')")
    @PostMapping("/{id}/review")
    public ResponseEntity<JobRequestResponse> reviewJobRequest(@Valid @RequestBody JobRequestReviewRequest request,
                                                                 @PathVariable Long id,
                                                                 Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.reviewJobRequest(id, request, AuthenticatedUser.id(authentication)));
    }

    /** Either party involved in the job can look it up. */
    @GetMapping("/{id}")
    public ResponseEntity<JobRequestResponse> getJobRequest(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.getJobRequest(id, AuthenticatedUser.id(authentication)));
    }

    /**
     * The caller's jobs: the ones they requested and, for a professional, also the ones requested to them.
     * Optionally only those in one status (e.g. ?status=PROPOSED for a professional's pending requests).
     */
    @GetMapping("/mine")
    public ResponseEntity<List<JobRequestResponse>> getMyJobRequests(@RequestParam(required = false) JobStatus status,
                                                                     Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.getMyJobRequests(AuthenticatedUser.id(authentication), status));
    }
}
