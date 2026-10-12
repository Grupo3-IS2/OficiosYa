export type JobStatus = 'PROPOSED' | 'ACCEPTED' | 'RESCHEDULE_REQUESTED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'

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
    location: string
    paymentAmount: number
    status: JobStatus
    tasks: JobTask[]
    /** The agreed timeframe; null until the professional accepts. */
    scheduledStart?: string | null
    scheduledEnd?: string | null
    /** The new timeframe the client asked for; only set while RESCHEDULE_REQUESTED. */
    rescheduleStart?: string | null
    rescheduleEnd?: string | null
    createdAt: string
}
