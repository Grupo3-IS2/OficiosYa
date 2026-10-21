package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.AuthenticatedUser;
import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCancelRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRejectRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRescheduleRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.response.ConversationResponse;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.dto.response.ReviewResponse;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.service.interfaces.ChatService;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;

/**
 * Lifecycle: PROPOSED → accept → ACCEPTED → complete (PIN) → COMPLETED → review.
 * Either side proposes (proposedBy) and the other accepts or rejects it; a proposal nobody answers
 * in time becomes CANCELLED. From PROPOSED or ACCEPTED it can be cancelled by either side.
 * Once ACCEPTED either side can ask to reschedule (→ RESCHEDULE_REQUESTED); the other side's
 * answer takes it back to ACCEPTED, at the new time or the original one.
 */
@RestController
@RequestMapping("/api/v1/job-requests")
public class JobRequestController {

    private final JobRequestService jobRequestService;
    private final ChatService chatService;

    public JobRequestController(JobRequestService jobRequestService, ChatService chatService) {
        this.jobRequestService = jobRequestService;
        this.chatService = chatService;
    }

    /**
     * With professionalId: the caller proposes as a client (professionals included, to someone else);
     * the professional picks the timeframe when accepting, and this response is the only place the PIN
     * appears. With clientId: a professional proposes to a client they already have a conversation
     * with, with startTimestamp/endTimestamp; the PIN comes when the client accepts. Exactly one of the
     * two. Either way the proposal shows up as a card in the pair's chat; 403 if that chat is blocked.
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

    /**
     * Only the side that didn't propose can accept it, and this blocks the professional's agenda. A
     * professional accepting a client's proposal sends the timeframe; a client accepting a professional's
     * sends no body, and gets the PIN in this response, the only time it appears.
     */
    @PostMapping("/{id}/accept")
    public ResponseEntity<JobRequestResponse> acceptJobRequest(@Valid @RequestBody(required = false) JobRequestAcceptRequest request,
                                                                 @PathVariable Long id,
                                                                 Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.acceptJobRequest(id, request, AuthenticatedUser.id(authentication)));
    }

    /** Only the side that didn't propose; the body, with an optional reason, can be left out. */
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

    /**
     * Either side proposes a new timeframe for an accepted job, with enough notice; the other side
     * has to approve it.
     */
    @PostMapping("/{id}/reschedule")
    public ResponseEntity<JobRequestResponse> requestReschedule(@Valid @RequestBody JobRequestRescheduleRequest request,
                                                                  @PathVariable Long id,
                                                                  Authentication authentication) {
        return ResponseEntity.ok(jobRequestService.requestReschedule(id, request, AuthenticatedUser.id(authentication)));
    }

    /** Only the side that didn't ask for the reschedule can answer it. */
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

    @PreAuthorize("hasRole('CLIENT')")
    @GetMapping("/reviews")
    public ResponseEntity<Page<ReviewResponse>> getMyReviews(Authentication authentication,
                                                             @ParameterObject @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(jobRequestService.getMyReviews(AuthenticatedUser.id(authentication), pageable));
    }

    /**
     * The chat between the job's two sides, in any status of the job: 201 if the conversation is new,
     * 200 if the pair already had one (from the profile or from another job). Same conversation API as
     * ConversationController from then on.
     */
    @PreAuthorize("hasRole('CLIENT')")
    @PostMapping("/{id}/conversation")
    public ResponseEntity<ConversationResponse> openConversation(@PathVariable Long id, Authentication authentication) {
        return ConversationController.foundOrCreated(
                chatService.openForJobRequest(id, AuthenticatedUser.id(authentication)));
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
