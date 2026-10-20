package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCancelRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRejectRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRescheduleRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.dto.response.ReviewResponse;
import com.um.uy.oficiosya.entity.JobStatus;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.util.List;
import java.util.UUID;

public interface JobRequestService {
    /**
     * The caller proposes a job, either as a client to a professional (who picks the timeframe when
     * accepting; the PIN is in this response) or as a professional to a client they already have a
     * conversation with (with the timeframe; the PIN comes when the client accepts).
     */
    JobRequestResponse createJobRequest(JobRequestCreateRequest request, UUID callerId);

    /**
     * The side that didn't propose accepts: a professional with the timeframe they pick, a client with
     * no request (the professional's timeframe), getting the PIN in this response.
     */
    JobRequestResponse acceptJobRequest(Long id, JobRequestAcceptRequest request, UUID requesterId);
    /** The side that didn't propose turns it down; the request (and its reason) is optional. */
    JobRequestResponse rejectJobRequest(Long id, JobRequestRejectRequest request, UUID requesterId);

    /** Moves a still unanswered proposal to CANCELLED; false if it was answered in between. */
    boolean expireProposal(Long id);

    /**
     * Either side can cancel; the request (and its reason) is optional. Once accepted, it needs the
     * configured notice before the job starts, and it frees the agenda.
     */
    JobRequestResponse cancelJobRequest(Long id, JobRequestCancelRequest request, UUID requesterId);

    /** Either side asks to move an ACCEPTED job; it stays at its original time until the other side approves. */
    JobRequestResponse requestReschedule(Long id, JobRequestRescheduleRequest request, UUID requesterId);
    /** The side that didn't ask approves the new timeframe, which moves the job's agenda block. */
    JobRequestResponse acceptReschedule(Long id, UUID requesterId);
    /** The side that didn't ask turns down the new timeframe; the job stays at its original one. */
    JobRequestResponse rejectReschedule(Long id, UUID requesterId);

    /** The professional enters the client's PIN on site; this is what moves the job to COMPLETED. */
    JobRequestResponse completeJobRequest(Long id, JobRequestCompleteRequest request, UUID professionalId);

    /** The client rates a COMPLETED job once; the professional's rating becomes the average of their reviews. */
    JobRequestResponse reviewJobRequest(Long id, JobRequestReviewRequest request, UUID clientId);
    Page<ReviewResponse> getProfessionalReviews(UUID professionalId, Pageable pageable);
    Page<ReviewResponse> getMyReviews(UUID clientId, Pageable pageable);
    JobRequestResponse getJobRequest(Long id, UUID requesterId);
    /** The jobs the user takes part in, as client or as professional; only those in the given status if not null. */
    List<JobRequestResponse> getMyJobRequests(UUID userId, JobStatus status);

    /** Every job request in the platform, regardless of who it belongs to. Admin-only. */
    List<JobRequestResponse> listAllJobRequests();
}
