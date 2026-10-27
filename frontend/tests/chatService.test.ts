import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import type { Conversation } from '../src/services/chatService.ts'
import {
    getConversations,
    getMessages,
    getUnreadCount,
    markRead,
    openConversation,
    recalledConversation,
    sendMessage,
    setConversationBlocked,
} from '../src/services/chatService.ts'

const storage = new Map<string, string>()
const originalFetch = globalThis.fetch
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const originalSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
const events = new EventTarget()
Object.defineProperty(globalThis, 'window', { configurable: true, value: events })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
} })

const calls: { url: string; options: RequestInit }[] = []
let status = 200
let responseBody: unknown = []
const conversation: Conversation = { id: 12, otherParticipant: { id: 'professional-uuid', name: 'Ana', profileImageUrl: null, role: 'PROFESSIONAL' },
    myRole: 'CLIENT', lastMessagePreview: null, lastMessageAt: null, unreadCount: 0, canWrite: true, blockedByMe: false }
beforeEach(() => {
    calls.length = 0; storage.clear(); status = 200; responseBody = []
    globalThis.fetch = async (input, options = {}) => {
        calls.push({ url: String(input), options })
        return status === 204 ? new Response(null, { status }) : Response.json(responseBody, { status })
    }
})
after(() => {
    globalThis.fetch = originalFetch
    for (const [name, descriptor] of [['window', originalWindow], ['localStorage', originalLocal], ['sessionStorage', originalSession]] as const) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else Reflect.deleteProperty(globalThis, name)
    }
})

test('history uses the real before/limit cursor contract', async () => {
    await getMessages(12, 345, 40)
    assert.equal(calls[0].url, '/api/v1/conversations/12/messages?limit=40&before=345')
})
test('send and retry carry the same caller-provided id without spoofing sender or recipient', async () => {
    status = 400; responseBody = { message: 'Error de envío' }
    await assert.rejects(sendMessage(12, 'Hola', 'stable-id'), /Error de envío/)
    status = 201; responseBody = { id: 345 }
    await sendMessage(12, 'Hola', 'stable-id')
    assert.deepEqual(JSON.parse(calls[0].options.body as string), { content: 'Hola', clientMessageId: 'stable-id' })
    assert.equal(calls[0].options.body, calls[1].options.body)
})
test('opening an empty conversation preserves its actual participant data across navigation', async () => {
    responseBody = conversation
    await openConversation('professional-uuid', 'viewer-uuid')
    assert.deepEqual(recalledConversation('viewer-uuid', 12), conversation)
    assert.equal(recalledConversation('different-viewer', 12), null)
    assert.deepEqual(JSON.parse(calls[0].options.body as string), { professionalId: 'professional-uuid' })
})
test('malformed session data does not break chat selection', () => {
    storage.set('oficiosya_chat_viewer_12', '{bad')
    assert.equal(recalledConversation('viewer', 12), null)
})
test('block and unblock use POST and DELETE on the existing endpoint', async () => {
    responseBody = conversation
    await setConversationBlocked(12, true)
    await setConversationBlocked(12, false)
    assert.deepEqual(calls.map(call => [call.url, call.options.method]), [
        ['/api/v1/conversations/12/block', 'POST'], ['/api/v1/conversations/12/block', 'DELETE'],
    ])
})
test('read publishes a count-refresh event only after a successful backend acknowledgement', async () => {
    let changes = 0
    const follow = () => changes++
    events.addEventListener('oficiosya:chat-read', follow)
    try {
        status = 400; responseBody = { message: 'No pertenece a la conversación' }
        await assert.rejects(markRead(12, 345))
        assert.equal(changes, 0)
        status = 204
        await markRead(12, 345)
        assert.equal(changes, 1)
        assert.deepEqual(JSON.parse(calls[1].options.body as string), { lastReadMessageId: 345 })
    } finally { events.removeEventListener('oficiosya:chat-read', follow) }
})

test('chat services call the expected endpoints and payloads', async () => {
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), options: init ?? {} })
        if (String(url).endsWith('/unread-count')) return Response.json({ count: 4 })
        if (String(url).endsWith('/messages?limit=40')) return Response.json([])
        if (String(url).endsWith('/messages')) return Response.json({ id: 9 })
        if (String(url).endsWith('/read')) return new Response(null, { status: 204 })
        return Response.json([])
    }

    await openConversation('professional-1')
    await getConversations()
    await getMessages(12)
    await sendMessage(12, 'Hola')
    await markRead(12, 9)
    assert.equal(await getUnreadCount(), 4)

    assert.deepEqual(calls.map(request => request.url), [
        '/api/v1/conversations',
        '/api/v1/conversations',
        '/api/v1/conversations/12/messages?limit=40',
        '/api/v1/conversations/12/messages',
        '/api/v1/conversations/12/read',
        '/api/v1/conversations/unread-count',
    ])
    assert.deepEqual(JSON.parse(String(calls[0].options.body)), { professionalId: 'professional-1' })
    const sent = JSON.parse(String(calls[3].options.body))
    assert.equal(sent.content, 'Hola')
    assert.match(sent.clientMessageId, /^[0-9a-f-]{36}$/)
    assert.deepEqual(JSON.parse(String(calls[4].options.body)), { lastReadMessageId: 9 })
})
