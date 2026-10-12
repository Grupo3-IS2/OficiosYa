import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rescheduleDraftFrom, rescheduleTimeframe } from '../src/pages/Requests/rescheduleForm.ts'
import { changedParts } from '../src/pages/Requests/rescheduleTimeframe.ts'

const now = new Date('2026-10-12T12:00')

test('starts from the agreed timeframe', () => {
    const draft = rescheduleDraftFrom(new Date('2026-10-20T09:00').toISOString(), new Date('2026-10-20T11:30').toISOString())

    assert.deepEqual(draft, { date: '2026-10-20', startTime: '09:00', endTime: '11:30' })
    assert.deepEqual(rescheduleDraftFrom(null, null), { date: '', startTime: '', endTime: '' })
})

test('builds the new timeframe from the draft', () => {
    const timeframe = rescheduleTimeframe({ date: '2026-10-20', startTime: '09:00', endTime: '11:30' }, {}, now)

    assert.ok(!('error' in timeframe))
    assert.equal(timeframe.start.getTime(), new Date('2026-10-20T09:00').getTime())
    assert.equal(timeframe.end.getTime(), new Date('2026-10-20T11:30').getTime())
})

test('rejects incomplete, inverted or past timeframes', () => {
    assert.ok('error' in rescheduleTimeframe({ date: '', startTime: '09:00', endTime: '10:00' }, {}, now))
    assert.ok('error' in rescheduleTimeframe({ date: '2026-10-20', startTime: '11:00', endTime: '10:00' }, {}, now))
    assert.ok('error' in rescheduleTimeframe({ date: '2026-10-20', startTime: '10:00', endTime: '10:00' }, {}, now))
    assert.ok('error' in rescheduleTimeframe({ date: '2026-10-11', startTime: '09:00', endTime: '10:00' }, {}, now))
})

test('rejects the timeframe already agreed', () => {
    const current = { start: new Date('2026-10-20T09:00').toISOString(), end: new Date('2026-10-20T11:30').toISOString() }

    assert.ok('error' in rescheduleTimeframe({ date: '2026-10-20', startTime: '09:00', endTime: '11:30' }, current, now))
    assert.ok(!('error' in rescheduleTimeframe({ date: '2026-10-20', startTime: '09:00', endTime: '12:00' }, current, now)))
})

test('marks only the pieces of the timeframe that change', () => {
    const current = { day: 'jueves, 15 de octubre', startTime: '10:00', endTime: '12:00' }

    assert.deepEqual([...changedParts(current, { ...current, startTime: '11:00' })], ['startTime'])
    assert.deepEqual([...changedParts(current, { day: 'viernes, 16 de octubre', startTime: '10:00', endTime: '13:00' })], ['day', 'endTime'])
    assert.deepEqual([...changedParts(current, current)], [])
})
