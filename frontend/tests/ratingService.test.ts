import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { after, beforeEach, test } from 'node:test'

const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) }
    catch (error) {
        if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
        throw error
    }
} })
const service = await import('../src/services/jobRequestService.ts')
const { onRatingChange } = await import('../src/services/ratingEvents.ts')
const { ApiError } = await import('../src/services/api.ts')
const originalFetch = globalThis.fetch
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const events = new EventTarget()
const stored = new Map<string, string>()
Object.defineProperty(globalThis, 'window', { configurable: true, value: events })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: (key: string, value: string) => stored.set(key, value),
} })
const calls: { url: string; options: RequestInit }[] = []
let status = 200
let responseBody: unknown
beforeEach(() => {
    calls.length = 0; stored.clear(); status = 200
    responseBody = { id: 5, professionalId: 'professional-uuid', status: 'COMPLETED', rating: 9, review: 'Bien' }
    globalThis.fetch = async (input, options = {}) => {
        calls.push({ url: String(input), options })
        return Response.json(responseBody, { status })
    }
})
after(() => {
    globalThis.fetch = originalFetch
    for (const [name, descriptor] of [['window', originalWindow], ['localStorage', originalLocal]] as const) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else Reflect.deleteProperty(globalThis, name)
    }
    hooks.deregister()
})

test('review posts integer backend scale to the existing endpoint and returns authoritative job', async () => {
    let changed: string | undefined
    const stop = onRatingChange(id => { changed = id })
    try {
        const result = await service.reviewJobRequest(5, { rating: 9, review: 'Bien' })
        assert.deepEqual(result, responseBody)
        assert.equal(calls[0].url, '/api/v1/job-requests/5/review')
        assert.equal(calls[0].options.method, 'POST')
        assert.deepEqual(JSON.parse(calls[0].options.body as string), { rating: 9, review: 'Bien' })
        assert.equal(changed, 'professional-uuid')
        assert.equal(stored.size, 1)
    } finally { stop() }
})

test('400/403/404/409 errors preserve their status and publish no rating update', async () => {
    let changes = 0
    const stop = onRatingChange(() => changes++)
    try {
        for (const code of [400, 403, 404, 409]) {
            status = code; responseBody = { message: 'No se puede valorar' }
            await assert.rejects(service.reviewJobRequest(5, { rating: 10, review: 'Bien' }),
                error => error instanceof ApiError && error.status === code)
        }
        assert.equal(changes, 0)
        assert.equal(stored.size, 0)
    } finally { stop() }
})

test('network failure does not publish an update and a later read uses the real detail endpoint', async () => {
    globalThis.fetch = async () => { throw new TypeError('Network error') }
    await assert.rejects(service.reviewJobRequest(5, { rating: 9, review: 'Bien' }))
    assert.equal(stored.size, 0)
    globalThis.fetch = async (input, options = {}) => {
        calls.push({ url: String(input), options })
        return Response.json(responseBody)
    }
    await service.getJobRequest(5)
    assert.equal(calls[0].url, '/api/v1/job-requests/5')
    assert.equal(calls[0].options.method, undefined)
})

test('cross-tab changes invalidate data, malformed events are ignored, and listeners clean up', () => {
    const changes: (string | undefined)[] = []
    const stop = onRatingChange(id => changes.push(id))
    const event = (value: string) => {
        const notification = new Event('storage')
        Object.assign(notification, { key: 'oficiosya_rating_changed', newValue: value })
        events.dispatchEvent(notification)
    }
    event('{invalid')
    event(JSON.stringify({ professionalId: 3 }))
    event(JSON.stringify({ professionalId: 'professional-uuid' }))
    assert.deepEqual(changes, ['professional-uuid'])
    stop()
    event(JSON.stringify({ professionalId: 'other' }))
    assert.deepEqual(changes, ['professional-uuid'])
})
