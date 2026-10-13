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

/** The professional takes the request and books the timeframe in their agenda: it becomes ACCEPTED. */
export function acceptJobRequest(id: number, start: Date, end: Date): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/accept`, {
        method: 'POST',
        body: JSON.stringify({
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
        }),
    })
}

/** The professional turns the request down, optionally saying why: it becomes REJECTED. */
export function rejectJobRequest(id: number, reason?: string): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
    })
}

/** Either side drops the request while it isn't done; once accepted, only with enough notice. */
export function cancelJobRequest(id: number, reason?: string): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
    })
}

/** Either side asks to move an accepted job to a new timeframe; it stays RESCHEDULE_REQUESTED until the other side answers. */
export function requestReschedule(id: number, start: Date, end: Date): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
        }),
    })
}

/** The side that didn't ask takes the new timeframe: the job moves to it and is ACCEPTED again. */
export function acceptReschedule(id: number): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/reschedule/accept`, { method: 'POST' })
}

/** The side that didn't ask keeps the original timeframe: the job is ACCEPTED again, unchanged. */
export function rejectReschedule(id: number): Promise<JobRequest> {
    return apiRequest<JobRequest>(`/job-requests/${id}/reschedule/reject`, { method: 'POST' })
}
