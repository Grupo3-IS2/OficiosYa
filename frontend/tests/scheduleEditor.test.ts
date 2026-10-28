import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clock, dateKey, everyDay, movedSeries, planCreation, rangeOn, slotHours, suggestedRange, weeklySlotFor } from '../src/pages/EditProfile/scheduleEditor.ts'
import type { Schedule, ScheduleType } from '../src/types/Schedule.ts'

function block(id: number, start: Date, end: Date, type: ScheduleType = 'URGENT_AVAILABLE'): Schedule {
    return { id, professionalId: 'pro', jobRequestId: null, type, startTimestamp: start.toISOString(), endTimestamp: end.toISOString(), rrule: null, tzid: null, exdates: null, recurrenceEnd: null }
}

const at = (day: number, hour: number) => new Date(2030, 4, day, hour)

test('a block with no neighbours is created on its own', () => {
    assert.deepEqual(planCreation({ start: at(6, 9), end: at(6, 12) }, [block(1, at(6, 14), at(6, 16))]),
        { kind: 'create', start: at(6, 9), end: at(6, 12) })
})

test('a block right after another one stretches it instead of adding a new one', () => {
    assert.deepEqual(planCreation({ start: at(6, 12), end: at(6, 14) }, [block(1, at(6, 9), at(6, 12))]),
        { kind: 'extend', id: 1, start: at(6, 9), end: at(6, 14), absorbedId: null })
})

test('a block right before another one stretches the later one backwards', () => {
    assert.deepEqual(planCreation({ start: at(6, 7), end: at(6, 9) }, [block(1, at(6, 9), at(6, 12))]),
        { kind: 'extend', id: 1, start: at(6, 7), end: at(6, 12), absorbedId: null })
})

test('filling the gap between two blocks joins them into one', () => {
    const schedules = [block(1, at(6, 9), at(6, 12)), block(2, at(6, 14), at(6, 18))]
    assert.deepEqual(planCreation({ start: at(6, 12), end: at(6, 14) }, schedules),
        { kind: 'extend', id: 1, start: at(6, 9), end: at(6, 18), absorbedId: 2 })
})

test('jobs are never stretched to cover availability', () => {
    assert.equal(planCreation({ start: at(6, 12), end: at(6, 14) }, [block(1, at(6, 9), at(6, 12), 'SCHEDULED_JOB')]).kind, 'create')
})

test('the usual week is never stretched by a one-off block', () => {
    const fromUsualWeek = { ...block(1, at(6, 9), at(6, 12)), rrule: 'FREQ=WEEKLY' }
    assert.equal(planCreation({ start: at(6, 12), end: at(6, 14) }, [fromUsualWeek]).kind, 'create')
})

test('a selection within one day repeats on that weekday at the same hours', () => {
    // 2030-05-06 is a Monday
    assert.deepEqual(weeklySlotFor({ start: at(6, 9), end: new Date(2030, 4, 6, 13, 30) }),
        { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '13:30' })
})

test('a selection until midnight repeats until the end of the day', () => {
    assert.deepEqual(weeklySlotFor({ start: at(11, 20), end: at(12, 0) }),
        { dayOfWeek: 'SATURDAY', startTime: '20:00', endTime: '00:00' })
})

test('a selection over several days cannot repeat weekly', () => {
    assert.equal(weeklySlotFor({ start: at(6, 9), end: at(7, 13) }), null)
})

test('slot hours read as a range, with midnight shown as 24:00', () => {
    assert.equal(slotHours({ startTime: '09:00:00', endTime: '18:30:00' }), '09:00 a 18:30')
    assert.equal(slotHours({ startTime: '20:00', endTime: '00:00' }), '20:00 a 24:00')
    assert.equal(everyDay('SATURDAY'), 'todos los sábados')
})

test('changing one week of a repeating block moves its first occurrence the same way', () => {
    // First occurrence Monday 6 from 9 to 12; the one of Monday 20 goes to Tuesday 21 from 14 to 18
    assert.deepEqual(movedSeries({ start: at(6, 9), end: at(6, 12) }, { start: at(20, 9), end: at(20, 12) }, { start: at(21, 14), end: at(21, 18) }),
        { start: at(7, 14), end: at(7, 18) })
})

test('changing the hours of the first occurrence keeps its day', () => {
    const first = { start: at(6, 9), end: at(6, 12) }
    assert.deepEqual(movedSeries(first, first, { start: at(6, 20), end: at(7, 0) }), { start: at(6, 20), end: at(7, 0) })
})

test('a new block is offered in the morning while the morning is still ahead', () => {
    assert.deepEqual(suggestedRange(at(8, 0), at(6, 15)), { start: at(8, 9), end: at(8, 13) })
    assert.deepEqual(suggestedRange(at(6, 0), new Date(2030, 4, 6, 8, 59)), { start: at(6, 9), end: at(6, 13) })
})

test('once the morning passed, a new block is offered from the next quarter of an hour', () => {
    assert.deepEqual(suggestedRange(at(6, 0), new Date(2030, 4, 6, 14, 7)),
        { start: new Date(2030, 4, 6, 14, 15), end: new Date(2030, 4, 6, 18, 15) })
    // Right on a quarter it is already late for it
    assert.deepEqual(suggestedRange(at(6, 0), at(6, 14)), { start: new Date(2030, 4, 6, 14, 15), end: new Date(2030, 4, 6, 18, 15) })
})

test('late at night the offer stops at midnight, or moves to the next day', () => {
    assert.deepEqual(suggestedRange(at(6, 0), new Date(2030, 4, 6, 22, 10)), { start: new Date(2030, 4, 6, 22, 15), end: at(7, 0) })
    assert.deepEqual(suggestedRange(at(6, 0), new Date(2030, 4, 6, 23, 50)), { start: at(7, 0), end: at(7, 4) })
})

test('hours typed in the edit panel become a range on that day, with 00:00 as midnight', () => {
    assert.deepEqual(rangeOn(at(6, 15), '09:30', '14:00'), { start: new Date(2030, 4, 6, 9, 30), end: at(6, 14) })
    assert.deepEqual(rangeOn(at(6, 15), '20:00', '00:00'), { start: at(6, 20), end: at(7, 0) })
    assert.equal(rangeOn(at(6, 15), '14:00', '09:00'), null)
    assert.equal(rangeOn(at(6, 15), '', '09:00'), null)
})

test('dates and times are written in local time', () => {
    assert.equal(dateKey(at(6, 23)), '2030-05-06')
    assert.equal(clock(new Date(2030, 4, 6, 7, 5)), '07:05')
})
