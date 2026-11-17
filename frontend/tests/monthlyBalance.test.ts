import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { JobRequest } from '../src/types/JobRequest.ts'
import { jobsBetween, monthlyBalance } from '../src/pages/Balance/monthlyBalance.ts'

function job(id: number, scheduledStart: string, changes: Partial<JobRequest> = {}): JobRequest {
    return {
        id, createdAt: '2026-01-01T12:00:00Z', status: 'COMPLETED', clientId: 'client', clientName: 'Ana',
        professionalId: 'pro', professionalName: 'Beto', location: 'Montevideo', paymentAmount: 1000,
        paymentState: 'PAID', platformFee: 150, payoutAt: null, scheduledStart, tasks: [],
        ...changes,
    } as JobRequest
}

test('paid jobs are summed per month, newest first, with what was already transferred', () => {
    const months = monthlyBalance([
        job(1, '2026-11-03T15:00:00Z'),
        job(2, '2026-11-20T15:00:00Z', { paymentAmount: 500.1, platformFee: 75.02, payoutAt: '2026-11-21T10:00:00Z' }),
        job(3, '2026-10-10T15:00:00Z', { payoutAt: '2026-10-11T10:00:00Z' }),
    ], 'pro')

    assert.deepEqual(months.map(month => month.month), ['2026-11', '2026-10'])
    assert.deepEqual(months.map(month => month.items.map(item => item.id)), [[2, 1], [3]])
    const totals = months.map(({ items: _items, ...total }) => total)
    assert.deepEqual(totals[0], { month: '2026-11', jobs: 2, gross: 1500.1, fee: 225.02, net: 1275.08, transferred: 425.08, pending: 850 })
    assert.deepEqual(totals[1], { month: '2026-10', jobs: 1, gross: 1000, fee: 150, net: 850, transferred: 850, pending: 0 })
})

test('only the professional\'s paid jobs count, by Montevideo\'s month', () => {
    const months = monthlyBalance([
        job(1, '2026-11-01T01:00:00Z'),
        job(2, '2026-11-10T15:00:00Z', { professionalId: 'someone else' }),
        job(3, '2026-11-10T15:00:00Z', { paymentState: 'RETAINED', platformFee: null }),
        job(4, '2026-11-10T15:00:00Z', { paymentState: 'REFUNDED' }),
    ], 'pro')

    // 01:00 UTC on the 1st is still October 31st in Montevideo (UTC-3)
    assert.deepEqual(months.map(month => [month.month, month.jobs]), [['2026-10', 1]])
})

test('the balance can be narrowed to the jobs done between two Montevideo days', () => {
    const jobs = [job(1, '2026-11-01T02:00:00Z'), job(2, '2026-11-05T15:00:00Z'), job(3, '2026-11-10T15:00:00Z')]
    const ids = (list: JobRequest[]) => list.map(item => item.id)

    assert.deepEqual(ids(jobsBetween(jobs, '', '')), [1, 2, 3])
    assert.deepEqual(ids(jobsBetween(jobs, '2026-11-05', '2026-11-10')), [2, 3])
    // 02:00 UTC on the 1st is still October 31st in Montevideo
    assert.deepEqual(ids(jobsBetween(jobs, '', '2026-10-31')), [1])
})
