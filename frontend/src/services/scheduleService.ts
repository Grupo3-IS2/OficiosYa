import type { DayOfWeek, Schedule, ScheduleType, WeeklyAvailability } from '../types/Schedule'
import { apiRequest, publicApiRequest } from './api'

const WEEKLY_URL = '/professionals/me/weekly-availability'

export function getProfessionalSchedule(
    professionalId: string,
    from?: Date,
    to?: Date,
): Promise<Schedule[]> {
    const query = new URLSearchParams({ professionalId })
    if (from) query.set('from', from.toISOString())
    if (to) query.set('to', to.toISOString())

    return publicApiRequest<Schedule[]>(`/schedules?${query.toString()}`)
}

function createBlock(type: ScheduleType, start: Date, end: Date): Promise<Schedule> {
    return apiRequest<Schedule>('/schedules', {
        method: 'POST',
        body: JSON.stringify({
            type,
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
        }),
    })
}

export function createAvailability(start: Date, end: Date): Promise<Schedule> {
    return createBlock('URGENT_AVAILABLE', start, end)
}

/** Marks time as not available, e.g. a day off in the middle of the usual week. */
export function createTimeOff(start: Date, end: Date): Promise<Schedule> {
    return createBlock('USER_RESERVED', start, end)
}

export function updateAvailability(id: number, start: Date, end: Date): Promise<Schedule> {
    return apiRequest<Schedule>(`/schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
        }),
    })
}

export async function deleteAvailability(id: number): Promise<void> {
    await apiRequest<void>(`/schedules/${id}`, { method: 'DELETE' })
}

export function createWeeklyAvailability(slot: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }): Promise<WeeklyAvailability> {
    return apiRequest<WeeklyAvailability>(WEEKLY_URL, { method: 'POST', body: JSON.stringify(slot) })
}

export function updateWeeklyAvailability(id: number, slot: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }): Promise<WeeklyAvailability> {
    return apiRequest<WeeklyAvailability>(`${WEEKLY_URL}/${id}`, { method: 'PUT', body: JSON.stringify(slot) })
}

/** Removes only the occurrence of that date ("YYYY-MM-DD"); the slot keeps repeating on every other week. */
export async function skipWeeklyOccurrence(id: number, date: string): Promise<void> {
    await apiRequest<void>(`${WEEKLY_URL}/${id}/skipped-dates`, { method: 'POST', body: JSON.stringify({ date }) })
}

export async function deleteWeeklyAvailability(id: number): Promise<void> {
    await apiRequest<void>(`${WEEKLY_URL}/${id}`, { method: 'DELETE' })
}
