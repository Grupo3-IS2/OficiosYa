import type { Schedule, ScheduleType } from '../types/Schedule'
import { apiRequest, publicApiRequest } from './api'

/** Repeats every week on the weekday and hours of its first occurrence, kept in local time across DST. */
const WEEKLY = { rrule: 'FREQ=WEEKLY', tzid: Intl.DateTimeFormat().resolvedOptions().timeZone }
/** A blank rule makes the block stop repeating; its skipped weeks go with it. */
const ONE_OFF = { rrule: '', exdates: [] }

/** `asOwner` sends the session: a profile not published yet only shows its agenda to its owner. */
export function getProfessionalSchedule(
    professionalId: string,
    from?: Date,
    to?: Date,
    asOwner = false,
): Promise<Schedule[]> {
    const query = new URLSearchParams({ professionalId })
    if (from) query.set('from', from.toISOString())
    if (to) query.set('to', to.toISOString())

    return (asOwner ? apiRequest : publicApiRequest)<Schedule[]>(`/schedules?${query.toString()}`)
}

function createBlock(type: ScheduleType, start: Date, end: Date, weekly = false): Promise<Schedule> {
    return apiRequest<Schedule>('/schedules', {
        method: 'POST',
        body: JSON.stringify({
            type,
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
            ...(weekly ? WEEKLY : {}),
        }),
    })
}

export function createAvailability(start: Date, end: Date, weekly = false): Promise<Schedule> {
    return createBlock('URGENT_AVAILABLE', start, end, weekly)
}

/** Marks time as not available, e.g. a day off in the middle of the usual week. */
export function createTimeOff(start: Date, end: Date): Promise<Schedule> {
    return createBlock('USER_RESERVED', start, end)
}

/** On a repeating block, start and end are those of its first occurrence. `weekly` undefined keeps how it repeats. */
export function updateAvailability(id: number, start: Date, end: Date, weekly?: boolean): Promise<Schedule> {
    return apiRequest<Schedule>(`/schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
            ...(weekly === undefined ? {} : weekly ? WEEKLY : ONE_OFF),
        }),
    })
}

/** Takes one occurrence out of a repeating block; every other week stays. */
export function skipOccurrence(occurrence: Schedule): Promise<Schedule> {
    return apiRequest<Schedule>(`/schedules/${occurrence.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ exdates: [...(occurrence.exdates ?? []), occurrence.startTimestamp] }),
    })
}

export async function deleteAvailability(id: number): Promise<void> {
    await apiRequest<void>(`/schedules/${id}`, { method: 'DELETE' })
}
