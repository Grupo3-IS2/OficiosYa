import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changedBlock, clock, dateKey, everyDay, planCreation, rangeOn, slotHours, weeklySlotFor, without } from '../src/pages/EditProfile/scheduleEditor.ts'
import type { Schedule, ScheduleType } from '../src/types/Schedule.ts'

function block(id: number, start: Date, end: Date, type: ScheduleType = 'URGENT_AVAILABLE'): Schedule {
    return { id, professionalId: 'pro', jobRequestId: null, type, startTimestamp: start.toISOString(), endTimestamp: end.toISOString(), weeklyAvailabilityId: null, blockStartTimestamp: null, blockEndTimestamp: null }
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
    const fromUsualWeek = { ...block(1, at(6, 9), at(6, 12)), id: null, weeklyAvailabilityId: 4 }
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

test('stretching the end of a piece stretches the end of its whole block', () => {
    const block = { start: at(6, 9), end: at(6, 18) }
    const piece = { start: at(6, 13), end: at(6, 18) }
    assert.deepEqual(changedBlock(block, piece, { start: at(6, 13), end: at(6, 20) }), { start: at(6, 9), end: at(6, 20) })
})

test('moving a whole block moves both of its edges', () => {
    const block = { start: at(6, 9), end: at(6, 12) }
    assert.deepEqual(changedBlock(block, block, { start: at(7, 10), end: at(7, 13) }), { start: at(7, 10), end: at(7, 13) })
})

test('a block cut in pieces is joined with its neighbours by its whole range', () => {
    // 9 to 18, shown as 9 to 11 and 13 to 18 because of a job
    const pieces = [
        { ...block(1, at(6, 9), at(6, 11)), blockStartTimestamp: at(6, 9).toISOString(), blockEndTimestamp: at(6, 18).toISOString() },
        { ...block(1, at(6, 13), at(6, 18)), blockStartTimestamp: at(6, 9).toISOString(), blockEndTimestamp: at(6, 18).toISOString() },
    ]
    assert.deepEqual(planCreation({ start: at(6, 18), end: at(6, 20) }, pieces),
        { kind: 'extend', id: 1, start: at(6, 9), end: at(6, 20), absorbedId: null })
})

test('a range without the parts other ranges cover', () => {
    assert.deepEqual(without({ start: at(6, 9), end: at(6, 18) }, [{ start: at(6, 10), end: at(6, 11) }, { start: at(6, 17), end: at(6, 19) }]),
        [{ start: at(6, 9), end: at(6, 10) }, { start: at(6, 11), end: at(6, 17) }])
    assert.deepEqual(without({ start: at(6, 9), end: at(6, 10) }, [{ start: at(6, 8), end: at(6, 11) }]), [])
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
