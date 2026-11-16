export type ScheduleType = 'SCHEDULED_JOB' | 'URGENT_AVAILABLE' | 'USER_RESERVED'

export interface Schedule {
    /** An occurrence of a repeating block keeps the id of the block it comes from. */
    id: number
    professionalId: string
    jobRequestId: number | null
    type: ScheduleType
    startTimestamp: string
    endTimestamp: string
    /** RFC 5545 rule, e.g. FREQ=WEEKLY; null when the block doesn't repeat. */
    rrule: string | null
    tzid: string | null
    /** Starts of the occurrences taken out of a repeating block. */
    exdates: string[] | null
    recurrenceEnd: string | null
}

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

/** A weekday and hours a block repeats on. Times are "HH:mm" or "HH:mm:ss"; an end of 00:00 means until midnight. */
export interface WeeklyAvailability {
    dayOfWeek: DayOfWeek
    startTime: string
    endTime: string
}
