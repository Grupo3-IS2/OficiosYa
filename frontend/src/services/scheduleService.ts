import type { Schedule } from '../types/Schedule'
import { apiRequest, publicApiRequest } from './api'

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

export function createAvailability(start: Date, end: Date): Promise<Schedule> {
    return apiRequest<Schedule>('/schedules', {
        method: 'POST',
        body: JSON.stringify({
            type: 'URGENT_AVAILABLE',
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
        }),
    })
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
