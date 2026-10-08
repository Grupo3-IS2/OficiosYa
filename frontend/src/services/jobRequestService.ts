import type { JobRequest } from '../types/JobRequest'
import { apiRequest } from './api'

export function getMyJobRequests(): Promise<JobRequest[]> {
    return apiRequest<JobRequest[]>('/job-requests/mine')
}
