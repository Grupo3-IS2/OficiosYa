export type ScheduleType = 'SCHEDULED_JOB' | 'URGENT_AVAILABLE' | 'USER_RESERVED'

export interface Schedule {
    id: number
    professionalId: string
    jobRequestId: number | null
    type: ScheduleType
    startTimestamp: string
    endTimestamp: string
}
