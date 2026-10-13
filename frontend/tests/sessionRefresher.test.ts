import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LoginResponse } from '../src/types/Auth.ts'
import { RENEW_MARGIN_MS, createSessionRefresher, type SessionRefresherDeps } from '../src/services/sessionRefresher.ts'

const NOW = 1_000_000_000_000

/** Tokens here are just names; `expirations` says when each one expires. */
function setup(overrides: Partial<SessionRefresherDeps> = {}, initialToken: string | null = 'old') {
    const state = { token: initialToken, calls: 0 }
    const expirations: Record<string, number> = { old: NOW + 10_000, new: NOW + 15 * 60_000, other: NOW + 15 * 60_000 }

    const deps: SessionRefresherDeps = {
        requestRefresh: async () => {
            state.calls++
            return { status: 200, body: { token: 'new' } as LoginResponse }
        },
        readToken: () => state.token,
        storeLogin: response => { state.token = response.token },
        expiresAt: token => expirations[token] ?? null,
        now: () => NOW,
        exclusive: task => task(),
        ...overrides,
    }
    return { state, refresh: createSessionRefresher(deps) }
}

describe('session refresher', () => {
    it('stores the new access token the backend answers', async () => {
        const { state, refresh } = setup()

        assert.equal(await refresh('old'), 'refreshed')
        assert.equal(state.token, 'new')
        assert.equal(state.calls, 1)
    })

    it('makes a single request for every caller of the tab at once', async () => {
        const { state, refresh } = setup()

        const outcomes = await Promise.all([refresh('old'), refresh('old'), refresh('old')])

        assert.deepEqual(outcomes, ['refreshed', 'refreshed', 'refreshed'])
        assert.equal(state.calls, 1)
    })

    it('does not ask again when another tab already stored a fresh token', async () => {
        const { state, refresh } = setup({}, 'other')

        assert.equal(await refresh('old'), 'refreshed')
        assert.equal(state.calls, 0)
    })

    it('asks again when the stored token is the one that was rejected, even if it looks fresh', async () => {
        const { state, refresh } = setup({}, 'other')

        assert.equal(await refresh('other'), 'refreshed')
        assert.equal(state.calls, 1)
        assert.equal(state.token, 'new')
    })

    it('a 401 means the session is over', async () => {
        const { state, refresh } = setup({ requestRefresh: async () => ({ status: 401 }) })

        assert.equal(await refresh('old'), 'expired')
        assert.equal(state.token, 'old')
    })

    it('a 401 after another tab won the race is not the end of the session', async () => {
        const { state, refresh } = setup({
            requestRefresh: async () => {
                state.token = 'other'
                return { status: 401 }
            },
        })

        assert.equal(await refresh('old'), 'refreshed')
    })

    it('an unreachable backend or a server error does not end the session', async () => {
        const offline = setup({ requestRefresh: async () => { throw new TypeError('Failed to fetch') } })
        const failing = setup({ requestRefresh: async () => ({ status: 503 }) })

        assert.equal(await offline.refresh('old'), 'unavailable')
        assert.equal(await failing.refresh('old'), 'unavailable')
        assert.equal(offline.state.token, 'old')
    })

    it('runs inside the cross-tab lock', async () => {
        let locked = false
        const { refresh } = setup({
            exclusive: async task => {
                locked = true
                try { return await task() } finally { locked = false }
            },
            requestRefresh: async () => {
                assert.ok(locked)
                return { status: 200, body: { token: 'new' } as LoginResponse }
            },
        })

        assert.equal(await refresh('old'), 'refreshed')
    })

    it('a token within the renewal margin is not taken as fresh', async () => {
        const { state, refresh } = setup({ expiresAt: () => NOW + RENEW_MARGIN_MS - 1 }, 'other')

        assert.equal(await refresh('old'), 'refreshed')
        assert.equal(state.calls, 1)
    })

    it('after one renewal ends, the next one asks again', async () => {
        const { state, refresh } = setup()

        await refresh('old')
        await refresh('new')

        assert.equal(state.calls, 2)
    })
})
