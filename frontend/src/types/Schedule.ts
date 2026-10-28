export type ScheduleType = 'SCHEDULED_JOB' | 'URGENT_AVAILABLE' | 'USER_RESERVED'

export interface Schedule {
    /** Null on the blocks that come from the usual week: they are not stored one by one. */
    id: number | null
    professionalId: string
    jobRequestId: number | null
    type: ScheduleType
    startTimestamp: string
    endTimestamp: string
    weeklyAvailabilityId: number | null
    /**
     * On availability: the whole block as the professional defined it. Jobs and time off are cut out of it,
     * so one block can come as several pieces that share these. Null on jobs and time off.
     */
    blockStartTimestamp: string | null
    blockEndTimestamp: string | null
}

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

/** A slot of the usual week. Times are "HH:mm" or "HH:mm:ss"; an end of 00:00 means until midnight. */
export interface WeeklyAvailability {
    id: number
    dayOfWeek: DayOfWeek
    startTime: string
    endTime: string
}
