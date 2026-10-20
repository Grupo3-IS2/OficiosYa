import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    getConversations,
    getMessages,
    getUnreadCount,
    markRead,
    openConversation,
    sendMessage,
} from '../src/services/chatService.ts'

class MemoryStorage {
    private values = new Map<string, string>()
    getItem(key: string) { return this.values.get(key) ?? null }
    setItem(key: string, value: string) { this.values.set(key, value) }
    removeItem(key: string) { this.values.delete(key) }
    clear() { this.values.clear() }
}

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

test('chat services call the expected endpoints and payloads', async () => {
    const originalStorage = globalThis.localStorage
    const originalFetch = globalThis.fetch
    const requests: Array<{ url: string, init?: RequestInit }> = []
    globalThis.localStorage = new MemoryStorage() as unknown as Storage
    globalThis.fetch = async (url, init) => {
        requests.push({ url: String(url), init })
        if (String(url).endsWith('/unread-count')) return response({ count: 4 })
        if (String(url).endsWith('/messages?limit=100')) return response([])
        if (String(url).endsWith('/messages')) return response({ id: 9 })
        if (String(url).endsWith('/read')) return new Response(null, { status: 204 })
        return response([])
    }

    try {
        await openConversation('professional-1')
        await getConversations()
        await getMessages(12)
        await sendMessage(12, 'Hola')
        await markRead(12, 9)
        assert.equal(await getUnreadCount(), 4)

        assert.deepEqual(requests.map(request => request.url), [
            '/api/v1/conversations',
            '/api/v1/conversations',
            '/api/v1/conversations/12/messages?limit=100',
            '/api/v1/conversations/12/messages',
            '/api/v1/conversations/12/read',
            '/api/v1/conversations/unread-count',
        ])
        assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { professionalId: 'professional-1' })
        const sent = JSON.parse(String(requests[3].init?.body))
        assert.equal(sent.content, 'Hola')
        assert.match(sent.clientMessageId, /^[0-9a-f-]{36}$/)
        assert.deepEqual(JSON.parse(String(requests[4].init?.body)), { lastReadMessageId: 9 })
    } finally {
        globalThis.localStorage = originalStorage
        globalThis.fetch = originalFetch
    }
})
