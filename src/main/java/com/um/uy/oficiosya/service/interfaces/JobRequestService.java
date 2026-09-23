package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;

import java.util.List;
import java.util.UUID;

public interface JobRequestService {
    JobRequestResponse createJobRequest(JobRequestCreateRequest request, UUID clientId);
    JobRequestResponse acceptJobRequest(Long id, JobRequestAcceptRequest request, UUID professionalId);
    JobRequestResponse rejectJobRequest(Long id, UUID professionalId);
    JobRequestResponse cancelJobRequest(Long id, UUID requesterId);
    /** The professional enters the client's PIN on site; this is what moves the job to COMPLETED. */
    JobRequestResponse completeJobRequest(Long id, JobRequestCompleteRequest request, UUID professionalId);

    /** The client rates a COMPLETED job once; the professional's rating becomes the average of their reviews. */
    JobRequestResponse reviewJobRequest(Long id, JobRequestReviewRequest request, UUID clientId);
    JobRequestResponse getJobRequest(Long id, UUID requesterId);
    /** The jobs the user takes part in, as client or as professional. */
    List<JobRequestResponse> getMyJobRequests(UUID userId);

    /** Every job request in the platform, regardless of who it belongs to. Admin-only. */
    List<JobRequestResponse> listAllJobRequests();
}
