import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { changedParts, timeframeParts, timeframeText } from '../src/pages/Requests/rescheduleTimeframe.ts'

describe('reschedule timeframe formatting and comparisons', () => {
    it('breaks an ISO timeframe into localized parts', () => {
        const parts = timeframeParts('2026-10-15T19:00:00Z', '2026-10-15T21:00:00Z')
        assert.ok(parts.day.includes('15'))
        assert.ok(parts.day.includes('octubre'))
        assert.equal(typeof parts.startTime, 'string')
        assert.equal(typeof parts.endTime, 'string')
    })

    it('formats a complete timeframe sentence in Spanish', () => {
        const text = timeframeText('2026-10-15T19:00:00Z', '2026-10-15T21:00:00Z')
        assert.ok(text.startsWith('el '))
        assert.ok(text.includes(' de '))
        assert.ok(text.includes(' a '))
    })

    it('detects when only the day changed', () => {
        const current = { day: 'jueves, 15 de octubre', startTime: '19:00', endTime: '21:00' }
        const proposed = { day: 'viernes, 16 de octubre', startTime: '19:00', endTime: '21:00' }
        const changed = changedParts(current, proposed)

        assert.equal(changed.size, 1)
        assert.ok(changed.has('day'))
        assert.ok(!changed.has('startTime'))
        assert.ok(!changed.has('endTime'))
    })

    it('detects when both start and end time changed', () => {
        const current = { day: 'jueves, 15 de octubre', startTime: '19:00', endTime: '21:00' }
        const proposed = { day: 'jueves, 15 de octubre', startTime: '10:00', endTime: '12:00' }
        const changed = changedParts(current, proposed)

        assert.equal(changed.size, 2)
        assert.ok(!changed.has('day'))
        assert.ok(changed.has('startTime'))
        assert.ok(changed.has('endTime'))
    })

    it('reports no changed parts when current and proposed are identical', () => {
        const current = { day: 'jueves, 15 de octubre', startTime: '19:00', endTime: '21:00' }
        const changed = changedParts(current, { ...current })

        assert.equal(changed.size, 0)
    })
})
