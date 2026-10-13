import type { CreatedJobRequest, CreateJobRequestPayload, JobRequest } from '../types/JobRequest'
import { apiRequest } from './api'

export function createJobRequest(payload: CreateJobRequestPayload): Promise<CreatedJobRequest> {
    return apiRequest<CreatedJobRequest>('/job-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
    })
}

export function getMyJobRequests(): Promise<JobRequest[]> {
    return apiRequest<JobRequest[]>('/job-requests/mine')
}

/** Asks the professional to move an accepted job to a new timeframe; it stays RESCHEDULE_REQUESTED until they answer. */
export function requestReschedule(id: number, start: Date, end: Date): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
        }),
    })
}

/** The professional takes the client's new timeframe: the job moves to it and is ACCEPTED again. */
export function acceptReschedule(id: number): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/reschedule/accept`, { method: 'POST' })
}

/** The professional keeps the original timeframe: the job is ACCEPTED again, unchanged. */
export function rejectReschedule(id: number): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/reschedule/reject`, { method: 'POST' })
}
