import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { JobRequest } from '../src/types/JobRequest.ts'
import { byNewest, filterPayouts, payoutProfessionals } from '../src/pages/Admin/payoutFilter.ts'

const paid = (id: number, payoutAt: string, professionalId = 'beto', professionalName = 'Beto') =>
    ({ id, payoutAt, professionalId, professionalName }) as JobRequest
const ids = (jobs: JobRequest[]) => jobs.map(job => job.id)

test('transfers are filtered by Montevideo day, both ends included and optional', () => {
    const payouts = [paid(1, '2026-11-01T02:00:00Z'), paid(2, '2026-11-05T15:00:00Z'), paid(3, '2026-11-10T15:00:00Z')]

    assert.deepEqual(ids(filterPayouts(payouts, '', '')), [1, 2, 3])
    assert.deepEqual(ids(filterPayouts(payouts, '2026-11-05', '2026-11-10')), [2, 3])
    assert.deepEqual(ids(filterPayouts(payouts, '', '2026-11-05')), [1, 2])
    // 02:00 UTC on the 1st is still October 31st in Montevideo
    assert.deepEqual(ids(filterPayouts(payouts, '2026-11-01', '')), [2, 3])
    assert.deepEqual(ids(filterPayouts(payouts, '2026-10-31', '2026-10-31')), [1])
})

test('refunds count by the day they were given back, and sort with the transfers', () => {
    const refund = { id: 2, paymentState: 'REFUNDED', updatedAt: '2026-11-06T15:00:00Z', professionalId: 'beto' } as JobRequest
    const jobs = [paid(1, '2026-11-05T15:00:00Z'), refund, paid(3, '2026-11-07T15:00:00Z')]

    assert.deepEqual(ids(filterPayouts(jobs, '2026-11-06', '2026-11-06')), [2])
    assert.deepEqual(ids(byNewest(jobs)), [3, 2, 1])
})

test('transfers can be narrowed to one professional, listed once each by name', () => {
    const payouts = [paid(1, '2026-11-05T15:00:00Z'), paid(2, '2026-11-06T15:00:00Z', 'ana', 'Ana'), paid(3, '2026-11-07T15:00:00Z')]

    assert.deepEqual(ids(filterPayouts(payouts, '', '', 'beto')), [1, 3])
    assert.deepEqual(ids(filterPayouts(payouts, '2026-11-06', '', 'beto')), [3])
    assert.deepEqual(payoutProfessionals(payouts), [{ id: 'ana', name: 'Ana' }, { id: 'beto', name: 'Beto' }])
})
