import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarBlocks, currentWeek } from '../src/pages/ProfessionalProfile/scheduleCalendar.ts'
import type { Schedule } from '../src/types/Schedule.ts'

function schedule(id: number, type: Schedule['type'], start: Date, end: Date): Schedule {
    return {
        id,
        professionalId: 'a75851c5-7e05-4c78-9dda-2207d8ec3028',
        jobRequestId: null,
        type,
        startTimestamp: start.toISOString(),
        endTimestamp: end.toISOString(),
    }
}

test('the current week starts on Monday and ends the following Monday', () => {
    const reference = new Date(2030, 0, 2, 15, 30)
    const week = currentWeek(reference)

    assert.equal(week.start.getDay(), 1)
    assert.equal(week.start.getHours(), 0)
    assert.equal(week.end.getDay(), 1)
    assert.equal((week.end.getTime() - week.start.getTime()) / 86_400_000, 7)
})

test('urgent availability and occupied agenda entries keep their different meaning', () => {
    const week = currentWeek(new Date(2030, 0, 2))
    const availableStart = new Date(week.start)
    availableStart.setHours(9, 30)
    const availableEnd = new Date(availableStart)
    availableEnd.setHours(11, 0)
    const busyStart = new Date(week.start)
    busyStart.setDate(busyStart.getDate() + 2)
    busyStart.setHours(14, 0)
    const busyEnd = new Date(busyStart)
    busyEnd.setHours(16, 0)

    const blocks = calendarBlocks([
        schedule(1, 'URGENT_AVAILABLE', availableStart, availableEnd),
        schedule(2, 'SCHEDULED_JOB', busyStart, busyEnd),
    ], week)

    assert.deepEqual(blocks.map(({ day, startHour, endHour, kind }) => ({ day, startHour, endHour, kind })), [
        { day: 0, startHour: 9.5, endHour: 11, kind: 'available' },
        { day: 2, startHour: 14, endHour: 16, kind: 'busy' },
    ])
})

test('a block crossing midnight is split into the corresponding days', () => {
    const week = currentWeek(new Date(2030, 0, 2))
    const start = new Date(week.start)
    start.setHours(23, 0)
    const end = new Date(start)
    end.setHours(26, 0)

    const blocks = calendarBlocks([schedule(3, 'USER_RESERVED', start, end)], week)

    assert.deepEqual(blocks.map(({ day, startHour, endHour }) => ({ day, startHour, endHour })), [
        { day: 0, startHour: 23, endHour: 24 },
        { day: 1, startHour: 0, endHour: 2 },
    ])
})
