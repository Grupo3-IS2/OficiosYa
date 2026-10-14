import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REASON_MAX_LENGTH, acceptanceTimeframe, optionalReason } from '../src/pages/Requests/requestResponse.ts'

const now = new Date('2026-10-13T12:00:00')

describe('accepting a request', () => {
    it('answers the chosen timeframe', () => {
        const timeframe = acceptanceTimeframe({ date: '2026-10-15', startTime: '09:00', endTime: '11:30' }, now)

        assert.deepEqual(timeframe, { start: new Date('2026-10-15T09:00'), end: new Date('2026-10-15T11:30') })
    })

    it('needs the date and both times', () => {
        assert.deepEqual(acceptanceTimeframe({ date: '2026-10-15', startTime: '09:00', endTime: '' }, now),
            { error: 'Elegí la fecha y el horario.' })
    })

    it('needs the end after the start', () => {
        assert.deepEqual(acceptanceTimeframe({ date: '2026-10-15', startTime: '11:00', endTime: '11:00' }, now),
            { error: 'La hora de fin tiene que ser posterior a la de inicio.' })
    })

    it('needs a timeframe in the future', () => {
        assert.deepEqual(acceptanceTimeframe({ date: '2026-10-13', startTime: '11:00', endTime: '13:00' }, now),
            { error: 'El horario tiene que ser en el futuro.' })
    })
})

describe('the reason of a rejection or a cancellation', () => {
    it('sends no reason when it is left blank', () => {
        assert.deepEqual(optionalReason(''), {})
        assert.deepEqual(optionalReason('   \n '), {})
    })

    it('sends the reason trimmed', () => {
        assert.deepEqual(optionalReason('  No trabajo en esa zona.  '), { reason: 'No trabajo en esa zona.' })
    })

    it('refuses a reason over the backend limit', () => {
        assert.deepEqual(optionalReason('a'.repeat(REASON_MAX_LENGTH)), { reason: 'a'.repeat(REASON_MAX_LENGTH) })
        assert.ok('error' in optionalReason('a'.repeat(REASON_MAX_LENGTH + 1)))
    })
})
