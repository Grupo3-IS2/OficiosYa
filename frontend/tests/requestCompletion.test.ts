import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import { canCompleteRequest, completionPin } from '../src/pages/Requests/requestResponse.ts'
import type { JobStatus } from '../src/types/JobRequest.ts'

test('only the professional assigned to an accepted job can enter its PIN', () => {
    const request = { professionalId: 'assigned-professional', status: 'ACCEPTED' as const }
    assert.equal(canCompleteRequest(request, 'assigned-professional'), true)
    assert.equal(canCompleteRequest(request, 'client'), false)
    assert.equal(canCompleteRequest(request, 'another-professional'), false)
    assert.equal(canCompleteRequest(request, undefined), false)
})

test('a pending reschedule still allows completion; closed and unaccepted requests do not', () => {
    assert.equal(canCompleteRequest({ professionalId: 'pro', status: 'RESCHEDULE_REQUESTED' }, 'pro'), true)
    for (const status of ['PROPOSED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'] as JobStatus[]) {
        assert.equal(canCompleteRequest({ professionalId: 'pro', status }, 'pro'), false)
    }
})

test('the completion PIN preserves leading zeroes and trims surrounding whitespace', () => {
    assert.deepEqual(completionPin(' 001234 '), { pin: '001234' })
    assert.deepEqual(completionPin('000000'), { pin: '000000' })
})

test('empty, partial, long and non-numeric PINs are rejected before submission', () => {
    for (const value of ['', '12345', '1234567', 'abcdef', '12 345', '1e0000']) assert.ok('error' in completionPin(value))
})

// Exercise the existing API client without a browser or a running backend.
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) }
    catch (error) {
        if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
        throw error
    }
} })
const { completeJobRequest } = await import('../src/services/jobRequestService.ts')
const originalFetch = globalThis.fetch
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
const calls: { url: string; options: RequestInit }[] = []
let fail = false
beforeEach(() => {
    calls.length = 0
    fail = false
    globalThis.fetch = async (input, options = {}) => {
        calls.push({ url: String(input), options })
        return fail ? Response.json({ message: 'El PIN ingresado es incorrecto' }, { status: 400 })
            : Response.json({ id: 12, status: 'COMPLETED', rating: null })
    }
})
after(() => {
    globalThis.fetch = originalFetch
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    hooks.deregister()
})

test('completion posts only the PIN to the existing endpoint and returns authoritative state', async () => {
    const result = await completeJobRequest(12, '001234')
    assert.equal(calls[0].url, '/api/v1/job-requests/12/complete')
    assert.equal(calls[0].options.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].options.body as string), { pin: '001234' })
    assert.equal(result.status, 'COMPLETED')
    assert.equal(result.rating, null)
})

test('an incorrect PIN surfaces the backend error and can be retried', async () => {
    fail = true
    await assert.rejects(completeJobRequest(12, '123456'), /El PIN ingresado es incorrecto/)
    fail = false
    assert.equal((await completeJobRequest(12, '001234')).status, 'COMPLETED')
})
