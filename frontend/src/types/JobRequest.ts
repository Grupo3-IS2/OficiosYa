import type { ServiceArea } from './Professional'

export type JobStatus = 'PROPOSED' | 'ACCEPTED' | 'RESCHEDULE_REQUESTED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'
export type PaymentState = 'PENDING' | 'RETAINED' | 'PAID' | 'REFUNDED'
export type RequestParty = 'CLIENT' | 'PROFESSIONAL'

export interface JobTask {
    id: number
    tradeId: number
    tradeName: string
    description: string
}

export interface JobRequest {
    id: number
    clientId: string
    clientName: string
    clientProfileImageUrl: string | null
    professionalId: string
    professionalName: string
    professionalProfileImageUrl: string | null
    clientEmail?: string | null
    professionalPhoneNumber?: string | null
    location: string
    /** The location's point, when it was chosen on the map. */
    latitude?: number | null
    longitude?: number | null
    /** Whether the location is beyond the professional's service area; null when it can't be told. */
    outsideServiceArea?: boolean | null
    /** The area the professional covers, its centre rounded like on their public profile. */
    professionalServiceArea?: ServiceArea | null
    paymentAmount: number
    paymentState?: PaymentState
    status: JobStatus
    tasks: JobTask[]
    /** The timeframe the proposing side asked for, while the proposal waits for an answer. */
    proposedStart?: string | null
    proposedEnd?: string | null
    /** The agreed timeframe; null until the professional accepts. */
    scheduledStart?: string | null
    scheduledEnd?: string | null
    /** The new timeframe one side asked for; only set while RESCHEDULE_REQUESTED. */
    rescheduleStart?: string | null
    rescheduleEnd?: string | null
    /** Who asked for it: the other side answers. Null on requests from before either side could ask (the client's). */
    rescheduleRequestedBy?: RequestParty | null
    rejectionReason?: string | null
    cancelledBy?: RequestParty | null
    cancellationReason?: string | null
    rating?: number | null
    review?: string | null
    createdAt: string
    updatedAt?: string
    /** Only returned by the backend immediately after creating the request. */
    confirmationPin?: string | null
}

export interface JobRequestTaskInput {
    tradeId: number
    description: string
}

export interface CreateJobRequestPayload {
    professionalId: string
    /** The timeframe the client recommends, if any; the professional confirms or changes it when accepting. */
    startTimestamp?: string
    endTimestamp?: string
    location: string
    /** The location's point, when chosen on the map. */
    latitude?: number
    longitude?: number
    paymentAmount: number
    tasks: JobRequestTaskInput[]
}

export type CreatedJobRequest = JobRequest & { confirmationPin: string }
