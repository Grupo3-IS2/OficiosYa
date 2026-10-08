export interface JobRequestTaskInput {
    tradeId: number
    description: string
}

export interface CreateJobRequestPayload {
    professionalId: string
    location: string
    paymentAmount: number
    tasks: JobRequestTaskInput[]
}

export interface CreateJobRequestResponse {
    id: number
    confirmationPin: string
}
