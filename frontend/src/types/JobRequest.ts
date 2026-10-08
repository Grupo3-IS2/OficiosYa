export type JobStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'

export interface JobTask {
    id: number
    tradeId: number
    tradeName: string
    description: string
}

export interface JobRequest {
    id: number
    clientId: string
    professionalId: string
    professionalName: string
    professionalProfileImageUrl: string | null
    location: string
    paymentAmount: number
    status: JobStatus
    tasks: JobTask[]
    createdAt: string
}
