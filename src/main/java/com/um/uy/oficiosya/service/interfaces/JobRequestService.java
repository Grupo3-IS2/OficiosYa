package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestConfirmRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;

import java.util.List;
import java.util.UUID;

public interface JobRequestService {
    JobRequestResponse createJobRequest(JobRequestCreateRequest request, UUID clientId);
    JobRequestResponse acceptJobRequest(Long id, JobRequestAcceptRequest request, UUID professionalId);
    JobRequestResponse rejectJobRequest(Long id, UUID professionalId);
    JobRequestResponse cancelJobRequest(Long id, UUID requesterId);
    JobRequestResponse confirmJobRequest(Long id, JobRequestConfirmRequest request, UUID professionalId);
    JobRequestResponse getJobRequest(Long id, UUID requesterId);
    List<JobRequestResponse> getJobRequestsAsClient(UUID clientId);
    List<JobRequestResponse> getJobRequestsAsProfessional(UUID professionalId);

    /** Every job request in the platform, regardless of who it belongs to. Admin-only. */
    List<JobRequestResponse> listAllJobRequests();
}
