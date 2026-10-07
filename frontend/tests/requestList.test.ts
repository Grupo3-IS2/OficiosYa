import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { JobRequest } from '../src/types/JobRequest.ts'
import { filterAndOrderRequests, groupRequestsByDate, requestDescription, serviceSummary } from '../src/pages/Requests/requestList.ts'

function request(id: number, createdAt: string, status: JobRequest['status']): JobRequest {
    return {
        id,
        createdAt,
        status,
        clientId: 'client-id',
        professionalId: 'professional-id',
        professionalName: 'Profesional',
        professionalProfileImageUrl: null,
        location: 'Montevideo',
        paymentAmount: 1000,
        tasks: [{ id: 1, tradeId: 1, tradeName: 'Plomería', description: 'Descripción' }],
    }
}

test('filters by visible status and orders without mutating the source', () => {
    const requests = [
        request(1, '2026-10-04T12:00:00-03:00', 'ACCEPTED'),
        request(2, '2026-10-07T12:00:00-03:00', 'PROPOSED'),
        request(3, '2026-09-28T12:00:00-03:00', 'ACCEPTED'),
    ]

    assert.deepEqual(filterAndOrderRequests(requests, 'accepted', 'newest').map(item => item.id), [1, 3])
    assert.deepEqual(filterAndOrderRequests(requests, 'all', 'oldest').map(item => item.id), [3, 1, 2])
    assert.deepEqual(requests.map(item => item.id), [1, 2, 3])
})

test('groups consecutive ordered requests by their local date key', () => {
    const groups = groupRequestsByDate([
        request(1, '2026-10-07T12:00:00-03:00', 'PROPOSED'),
        request(2, '2026-10-07T09:00:00-03:00', 'ACCEPTED'),
        request(3, '2026-10-04T12:00:00-03:00', 'COMPLETED'),
    ])

    assert.deepEqual(groups.map(group => [group.dateKey, group.requests.length]), [
        ['2026-10-07', 2],
        ['2026-10-04', 1],
    ])
})

test('uses the compact multi-task summary from the product brief', () => {
    const base = request(1, '2026-10-07T12:00:00-03:00', 'PROPOSED')
    assert.equal(serviceSummary({ ...base, tasks: [...base.tasks, { ...base.tasks[0], id: 2 }, { ...base.tasks[0], id: 3 }] }), 'Plomería + 2 tareas')
    assert.equal(serviceSummary(base), 'Plomería')
    assert.equal(requestDescription(base), 'Descripción')
})

test('treats rejected requests as cancelled for the visible filter', () => {
    const requests = [
        request(1, '2026-10-07T12:00:00-03:00', 'CANCELLED'),
        request(2, '2026-10-06T12:00:00-03:00', 'REJECTED'),
        request(3, '2026-10-05T12:00:00-03:00', 'PROPOSED'),
    ]
    assert.deepEqual(filterAndOrderRequests(requests, 'cancelled', 'newest').map(item => item.id), [1, 2])
})
