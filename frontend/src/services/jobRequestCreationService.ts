import type { CreateJobRequestPayload, CreateJobRequestResponse } from '../types/JobRequestCreation'
import { apiRequest } from './api'

export function createJobRequest(payload: CreateJobRequestPayload): Promise<CreateJobRequestResponse> {
    return apiRequest<CreateJobRequestResponse>('/job-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
    })
}
