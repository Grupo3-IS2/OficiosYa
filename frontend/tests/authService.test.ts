import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearSession, TOKEN_KEY, USER_KEY } from '../src/services/session.ts'
import { logout, watchSessionFromOtherTabs } from '../src/services/authService.ts'

class MemoryStorage {
    private values = new Map<string, string>()
    getItem(key: string) { return this.values.get(key) ?? null }
    setItem(key: string, value: string) { this.values.set(key, value) }
    removeItem(key: string) { this.values.delete(key) }
    clear() { this.values.clear() }
}

test('logout revokes through the API and clears local credentials even on API failure', async () => {
    const originalStorage = globalThis.localStorage
    const originalFetch = globalThis.fetch
    const storage = new MemoryStorage()
    storage.setItem(TOKEN_KEY, 'token')
    storage.setItem(USER_KEY, '{"id":"1"}')
    globalThis.localStorage = storage as unknown as Storage
    let calls = 0
    globalThis.fetch = async () => {
        calls += 1
        return new Response(null, { status: 204 })
    }

    try {
        await logout()
        assert.equal(calls, 1)
        assert.equal(storage.getItem(TOKEN_KEY), null)
        assert.equal(storage.getItem(USER_KEY), null)
    } finally {
        globalThis.localStorage = originalStorage
        globalThis.fetch = originalFetch
    }
})

test('logout still clears credentials when the backend is unavailable', async () => {
    const originalStorage = globalThis.localStorage
    const originalFetch = globalThis.fetch
    const storage = new MemoryStorage()
    storage.setItem(TOKEN_KEY, 'token')
    globalThis.localStorage = storage as unknown as Storage
    globalThis.fetch = async () => { throw new Error('offline') }

    try {
        await logout()
        assert.equal(storage.getItem(TOKEN_KEY), null)
    } finally {
        globalThis.localStorage = originalStorage
        globalThis.fetch = originalFetch
    }
})

test('a storage event after another tab logs out redirects to login', () => {
    const originalStorage = globalThis.localStorage
    const originalWindow = globalThis.window
    const storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    let redirected = ''
    const listeners = new Map<string, (event: StorageEvent) => void>()
    globalThis.window = {
        addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener),
        location: { href: '' },
    } as unknown as Window & typeof globalThis

    try {
        watchSessionFromOtherTabs()
        listeners.get('storage')?.({
            storageArea: storage,
            key: TOKEN_KEY,
            oldValue: 'token',
            newValue: null,
        } as StorageEvent)
        redirected = window.location.href
        assert.equal(redirected, '/login')
    } finally {
        clearSession()
        globalThis.localStorage = originalStorage
        globalThis.window = originalWindow
    }
})
