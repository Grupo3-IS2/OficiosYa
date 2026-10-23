import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { after, beforeEach, test } from 'node:test'

const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        try { return nextResolve(specifier, context) }
        catch (error) {
            if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
            throw error
        }
    },
})

const {
    acceptJobRequest,
    acceptReschedule,
    cancelJobRequest,
    createJobRequest,
    getJobRequest,
    getMyJobRequests,
    rejectJobRequest,
    rejectReschedule,
    requestReschedule,
} = await import('../src/services/jobRequestService.ts')

const originalFetch = globalThis.fetch
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })

const calls: { url: string; options: RequestInit }[] = []
beforeEach(() => {
    calls.length = 0
    globalThis.fetch = async (input, options = {}) => {
        calls.push({ url: String(input), options })
        return Response.json({ id: 12, status: 'ACCEPTED' })
    }
})

after(() => {
    globalThis.fetch = originalFetch
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    hooks.deregister()
})

function bodyAt(index = 0): unknown {
    return JSON.parse(calls[index].options.body as string)
}

test('creates a request with the service payload and reads the current user requests', async () => {
    const payload = {
        professionalId: 'professional-uuid',
        location: 'Av. Italia 1234',
        paymentAmount: 2500,
        tasks: [{ tradeId: 4, description: 'Reparar la pérdida de agua.' }],
    }

    await createJobRequest(payload)
    await getMyJobRequests()

    assert.deepEqual(calls.map(call => [call.url, call.options.method]), [
        ['/api/v1/job-requests', 'POST'],
        ['/api/v1/job-requests/mine', undefined],
    ])
    assert.deepEqual(bodyAt(), payload)
})

test('accepts a request with ISO timestamps', async () => {
    const start = new Date('2030-05-06T09:00:00.000Z')
    const end = new Date('2030-05-06T11:30:00.000Z')

    await acceptJobRequest(12, start, end)

    assert.equal(calls[0].url, '/api/v1/job-requests/12/accept')
    assert.equal(calls[0].options.method, 'POST')
    assert.deepEqual(bodyAt(), {
        startTimestamp: start.toISOString(),
        endTimestamp: end.toISOString(),
    })
})

test('rejects and cancels with an optional trimmed reason', async () => {
    await rejectJobRequest(12, '  No trabajo en esa zona.  ')
    await cancelJobRequest(12)

    assert.deepEqual(calls.map(call => call.url), [
        '/api/v1/job-requests/12/reject',
        '/api/v1/job-requests/12/cancel',
    ])
    assert.deepEqual(bodyAt(), { reason: '  No trabajo en esa zona.  ' })
    assert.deepEqual(bodyAt(1), {})
})

test('requests a reschedule with the proposed timeframe', async () => {
    const start = new Date('2030-05-07T14:15:00.000Z')
    const end = new Date('2030-05-07T16:00:00.000Z')

    await requestReschedule(12, start, end)

    assert.equal(calls[0].url, '/api/v1/job-requests/12/reschedule')
    assert.deepEqual(bodyAt(), {
        startTimestamp: start.toISOString(),
        endTimestamp: end.toISOString(),
    })
})

test('accepts or rejects a pending reschedule without sending a body', async () => {
    await acceptReschedule(12)
    await rejectReschedule(12)
    await getJobRequest(12)

    assert.deepEqual(calls.map(call => [call.url, call.options.method, call.options.body]), [
        ['/api/v1/job-requests/12/reschedule/accept', 'POST', undefined],
        ['/api/v1/job-requests/12/reschedule/reject', 'POST', undefined],
        ['/api/v1/job-requests/12', undefined, undefined],
    ])
})
