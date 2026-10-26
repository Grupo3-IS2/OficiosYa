import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { JobRequest } from '../src/types/JobRequest.ts'
import { answersReschedule, awaitsAnswerFrom, filterAndOrderRequests, filterByDirection, groupRequestsByDate, outsideServiceAreaNote, rescheduleRequester, requestDescription, serviceSummary, viewerParty } from '../src/pages/Requests/requestList.ts'

function request(id: number, createdAt: string, status: JobRequest['status']): JobRequest {
    return {
        id,
        createdAt,
        status,
        clientId: 'client-id',
        clientName: 'Cliente',
        clientProfileImageUrl: null,
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

test('counts a pending reschedule as accepted', () => {
    const requests = [request(1, '2026-10-04T12:00:00-03:00', 'RESCHEDULE_REQUESTED')]

    assert.deepEqual(filterAndOrderRequests(requests, 'accepted', 'newest').map(item => item.id), [1])
})

test('splits the requests a professional received from the ones they sent', () => {
    const received = { ...request(1, '2026-10-07T12:00:00-03:00', 'PROPOSED'), professionalId: 'me', clientId: 'someone' }
    const sent = { ...request(2, '2026-10-06T12:00:00-03:00', 'PROPOSED'), professionalId: 'other-professional', clientId: 'me' }
    const requests = [received, sent]

    assert.deepEqual(filterByDirection(requests, 'received', 'me').map(item => item.id), [1])
    assert.deepEqual(filterByDirection(requests, 'sent', 'me').map(item => item.id), [2])
    assert.deepEqual(filterByDirection(requests, 'all', 'me').map(item => item.id), [1, 2])
    assert.deepEqual(filterByDirection(requests, 'received', undefined), [])
})

test('a reschedule is answered by the side that did not ask for it', () => {
    const pending = (rescheduleRequestedBy: 'CLIENT' | 'PROFESSIONAL' | null) =>
        ({ ...request(1, '2026-10-07T12:00:00-03:00', 'RESCHEDULE_REQUESTED'), rescheduleRequestedBy })

    assert.equal(answersReschedule(pending('CLIENT'), 'PROFESSIONAL'), true)
    assert.equal(answersReschedule(pending('CLIENT'), 'CLIENT'), false)
    assert.equal(answersReschedule(pending('PROFESSIONAL'), 'CLIENT'), true)
    assert.equal(answersReschedule(pending('PROFESSIONAL'), 'PROFESSIONAL'), false)
    // From before either side could ask: the client's, so the professional answers
    assert.equal(rescheduleRequester(pending(null)), 'CLIENT')
    assert.equal(answersReschedule(pending(null), 'PROFESSIONAL'), true)
    // Nothing to answer once it isn't pending
    assert.equal(answersReschedule(request(1, '2026-10-07T12:00:00-03:00', 'ACCEPTED'), 'PROFESSIONAL'), false)
})

test('what awaits the viewer: requests made to them and reschedules the other side asked for', () => {
    const asProfessional = { ...request(1, '2026-10-07T12:00:00-03:00', 'PROPOSED'), professionalId: 'me', clientId: 'someone' }
    const asClient = { ...request(2, '2026-10-07T11:00:00-03:00', 'PROPOSED'), professionalId: 'other', clientId: 'me' }
    const changeForMe = { ...request(3, '2026-10-07T10:00:00-03:00', 'RESCHEDULE_REQUESTED'), professionalId: 'other', clientId: 'me', rescheduleRequestedBy: 'PROFESSIONAL' as const }
    const myOwnChange = { ...request(4, '2026-10-07T09:00:00-03:00', 'RESCHEDULE_REQUESTED'), professionalId: 'me', clientId: 'someone', rescheduleRequestedBy: 'PROFESSIONAL' as const }
    const accepted = { ...request(5, '2026-10-07T08:00:00-03:00', 'ACCEPTED'), professionalId: 'me', clientId: 'someone' }
    const requests = [asProfessional, asClient, changeForMe, myOwnChange, accepted]

    assert.deepEqual(requests.filter(item => awaitsAnswerFrom(item, 'me')).map(item => item.id), [1, 3])
    assert.deepEqual(filterAndOrderRequests(requests, 'awaiting', 'newest', 'me').map(item => item.id), [1, 3])
    assert.equal(viewerParty(asClient, 'me'), 'CLIENT')
    assert.equal(awaitsAnswerFrom(asProfessional, undefined), false)
})

test('a job beyond the professional\'s area is pointed out to each side in its own words', () => {
    const base = request(1, '2026-10-07T12:00:00-03:00', 'PROPOSED')
    const outside = { ...base, outsideServiceArea: true }
    assert.equal(outsideServiceAreaNote(outside, true), `Fuera de la zona que cubre ${base.professionalName}`)
    assert.equal(outsideServiceAreaNote(outside, false), 'Fuera de tu zona de trabajo')
    assert.equal(outsideServiceAreaNote({ ...base, outsideServiceArea: false }, true), null)
    assert.equal(outsideServiceAreaNote({ ...base, outsideServiceArea: null }, false), null)
})
