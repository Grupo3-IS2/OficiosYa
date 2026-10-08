package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCancelRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRejectRequest;
import com.um.uy.oficiosya.dto.request.JobRequestRescheduleRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.entity.JobStatus;

import java.util.List;
import java.util.UUID;

public interface JobRequestService {
    JobRequestResponse createJobRequest(JobRequestCreateRequest request, UUID clientId);
    JobRequestResponse acceptJobRequest(Long id, JobRequestAcceptRequest request, UUID professionalId);
    /** The request (and its reason) is optional. */
    JobRequestResponse rejectJobRequest(Long id, JobRequestRejectRequest request, UUID professionalId);

    /**
     * Either side can cancel; the request (and its reason) is optional. Once accepted, it needs the
     * configured notice before the job starts, and it frees the agenda.
     */
    JobRequestResponse cancelJobRequest(Long id, JobRequestCancelRequest request, UUID requesterId);

    /** The client asks to move an ACCEPTED job; it stays at its original time until the professional approves. */
    JobRequestResponse requestReschedule(Long id, JobRequestRescheduleRequest request, UUID clientId);
    /** The professional approves the client's new timeframe, which moves the job's agenda block. */
    JobRequestResponse acceptReschedule(Long id, UUID professionalId);
    /** The professional turns down the new timeframe; the job stays at its original one. */
    JobRequestResponse rejectReschedule(Long id, UUID professionalId);

    /** The professional enters the client's PIN on site; this is what moves the job to COMPLETED. */
    JobRequestResponse completeJobRequest(Long id, JobRequestCompleteRequest request, UUID professionalId);

    /** The client rates a COMPLETED job once; the professional's rating becomes the average of their reviews. */
    JobRequestResponse reviewJobRequest(Long id, JobRequestReviewRequest request, UUID clientId);
    JobRequestResponse getJobRequest(Long id, UUID requesterId);
    /** The jobs the user takes part in, as client or as professional; only those in the given status if not null. */
    List<JobRequestResponse> getMyJobRequests(UUID userId, JobStatus status);

    /** Every job request in the platform, regardless of who it belongs to. Admin-only. */
    List<JobRequestResponse> listAllJobRequests();
}
