import assert from 'node:assert/strict'
import { test } from 'node:test'
import { professionalAvailability } from '../src/pages/Home/professionalAvailability.ts'
import type { Schedule } from '../src/types/Schedule.ts'

function schedule(id: number, type: Schedule['type'], start: number, end: number): Schedule {
    return {
        id,
        professionalId: 'professional',
        jobRequestId: null,
        type,
        startTimestamp: new Date(2030, 0, 2, start).toISOString(),
        endTimestamp: new Date(2030, 0, 2, end).toISOString(),
    }
}

test('availability ignores expired, occupied and invalid blocks and selects the earliest remaining slot', () => {
    const schedules = [
        schedule(1, 'URGENT_AVAILABLE', 16, 18),
        schedule(2, 'SCHEDULED_JOB', 11, 12),
        schedule(3, 'URGENT_AVAILABLE', 8, 9),
        schedule(4, 'URGENT_AVAILABLE', 13, 15),
        schedule(5, 'USER_RESERVED', 12, 13),
        schedule(6, 'URGENT_AVAILABLE', 10, 9),
    ]
    const result = professionalAvailability(schedules, new Date(2030, 0, 2, 10))
    assert.match(result, /^Disponible /)
    assert.match(result, /13:00 – 15:00$/)
})

test('an ongoing slot stays available until its end and an empty agenda has an explicit message', () => {
    const schedules = [schedule(1, 'URGENT_AVAILABLE', 9, 11)]
    assert.match(professionalAvailability(schedules, new Date(2030, 0, 2, 10)), /^Disponible /)
    assert.equal(professionalAvailability(schedules, new Date(2030, 0, 2, 11)), 'Sin disponibilidad esta semana')
    assert.equal(professionalAvailability([], new Date(2030, 0, 2)), 'Sin disponibilidad esta semana')
})
