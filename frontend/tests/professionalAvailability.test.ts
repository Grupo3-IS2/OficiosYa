import assert from 'node:assert/strict'
import { test } from 'node:test'
import { availabilityWindow, dayFromKey, dayKey, presetRanges, professionalAvailability, rangeLabel } from '../src/pages/Home/professionalAvailability.ts'
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

// Wednesday 2 January 2030, 10:00.
const wednesday = new Date(2030, 0, 2, 10)
const today = { from: '2030-01-02', to: '2030-01-02' }

test('the presets are today, tomorrow and until Sunday', () => {
    assert.deepEqual(presetRanges(wednesday).map(preset => preset.range), [
        { from: '2030-01-02', to: '2030-01-02' },
        { from: '2030-01-03', to: '2030-01-03' },
        { from: '2030-01-02', to: '2030-01-06' },
    ])
    // On Sunday "this week" is just that day.
    assert.deepEqual(presetRanges(new Date(2030, 0, 6, 10))[2].range, { from: '2030-01-06', to: '2030-01-06' })
})

test('day keys are local dates and read back as the same day', () => {
    assert.equal(dayKey(new Date(2030, 0, 2, 23, 59)), '2030-01-02')
    assert.deepEqual(dayFromKey('2030-01-02'), new Date(2030, 0, 2))
    assert.equal(rangeLabel(today, wednesday), 'hoy')
})

test('the window asked for runs from now (or the first day, if later) to the end of the last day', () => {
    assert.deepEqual(availabilityWindow(today, wednesday), { from: wednesday, to: new Date(2030, 0, 3) })
    assert.deepEqual(availabilityWindow({ from: '2030-01-05', to: '2030-01-06' }, wednesday), { from: new Date(2030, 0, 5), to: new Date(2030, 0, 7) })
})
