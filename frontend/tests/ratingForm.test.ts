import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canRateRequest, ratingFailure, ratingPayload, validateRating } from '../src/pages/Requests/ratingForm.ts'
import { ratingToStars, starLabel, starsToRating } from '../src/utils/ratingScale.ts'
import type { JobStatus } from '../src/types/JobRequest.ts'

test('all ten backend integers represent exact half-star steps without changing payload scale', () => {
    for (let rating = 1; rating <= 10; rating++) {
        assert.equal(ratingToStars(rating), rating * 0.5)
        assert.equal(starsToRating(ratingToStars(rating)), rating)
        assert.deepEqual(ratingPayload({ rating, review: ' Bien ' }), { rating, review: 'Bien' })
    }
    assert.equal(starLabel(9), '4,5')
    assert.equal(starLabel(10), '5')
})

test('averages retain their precision; only their label is rounded', () => {
    assert.equal(ratingToStars(8.35), 4.175)
    assert.equal(starLabel(8.35), '4,2')
    assert.equal(starsToRating(4.5), 9)
})

test('a rating is an integer from 1 to 10, not a displayed star count', () => {
    for (const rating of [null, 0, -1, 0.5, 4.5, 11, NaN, Infinity]) {
        assert.ok(validateRating({ rating, review: 'Bien' }).rating)
        assert.equal(ratingPayload({ rating, review: 'Bien' }), null)
    }
})

test('comment requires non-whitespace, allows one character, and is trimmed only in the payload', () => {
    for (const review of ['', ' ', '\n\t\u00a0']) assert.ok(validateRating({ rating: 9, review }).review)
    const draft = { rating: 9, review: '  ¡Excelente! \n' }
    assert.deepEqual(ratingPayload(draft), { rating: 9, review: '¡Excelente!' })
    assert.equal(draft.review, '  ¡Excelente! \n')
    assert.deepEqual(validateRating({ rating: 1, review: 'x' }), {})
    assert.deepEqual(validateRating({ rating: 10, review: 'x'.repeat(1000) }), {})
    assert.ok(validateRating({ rating: 10, review: 'x'.repeat(1001) }).review)
})

test('eligibility belongs to the job client, including a professional hiring someone else', () => {
    const job = { clientId: 'hiring-professional-uuid', status: 'COMPLETED' as const, rating: null }
    assert.equal(canRateRequest(job, job.clientId), true)
    assert.equal(canRateRequest({ ...job, rating: undefined }, job.clientId), true)
    assert.equal(canRateRequest(job, 'working-professional-uuid'), false)
    assert.equal(canRateRequest(job, undefined), false)
    for (const rating of [1, 9, 10]) assert.equal(canRateRequest({ ...job, rating }, job.clientId), false)
    for (const status of ['PROPOSED', 'ACCEPTED', 'RESCHEDULE_REQUESTED', 'CANCELLED', 'REJECTED', 'EXPIRED'] as JobStatus[]) {
        assert.equal(canRateRequest({ ...job, status }, job.clientId), false)
    }
    // Another completed job for the same professional is independently eligible.
    assert.equal(canRateRequest({ ...job }, job.clientId), true)
})

test('HTTP errors are actionable and do not turn into success', () => {
    assert.match(ratingFailure(403, ''), /Solo el cliente/)
    assert.match(ratingFailure(404, ''), /No encontramos/)
    assert.match(ratingFailure(409, ''), /comprobar/)
    assert.equal(ratingFailure(400, 'Solo trabajos completados.'), 'Solo trabajos completados.')
    assert.match(ratingFailure(undefined, ''), /se conservaron/)
})
