import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import type { Conversation } from '../src/services/chatService.ts'

// Match Vite's local TS resolution without starting Vite, a browser or a real backend.
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) }
    catch (error) {
        if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
        throw error
    }
} })
const service = await import('../src/services/chatService.ts')
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
    hooks.deregister()
})

test('history uses the real before/limit cursor contract', async () => {
    await service.getMessages(12, 345, 40)
    assert.equal(calls[0].url, '/api/v1/conversations/12/messages?limit=40&before=345')
})
test('send and retry carry the same caller-provided id without spoofing sender or recipient', async () => {
    status = 400; responseBody = { message: 'Error de envío' }
    await assert.rejects(service.sendMessage(12, 'Hola', 'stable-id'), /Error de envío/)
    status = 201; responseBody = { id: 345 }
    await service.sendMessage(12, 'Hola', 'stable-id')
    assert.deepEqual(JSON.parse(calls[0].options.body as string), { content: 'Hola', clientMessageId: 'stable-id' })
    assert.equal(calls[0].options.body, calls[1].options.body)
})
test('opening an empty conversation preserves its actual participant data across navigation', async () => {
    responseBody = conversation
    await service.openConversation('professional-uuid', 'viewer-uuid')
    assert.deepEqual(service.recalledConversation('viewer-uuid', 12), conversation)
    assert.equal(service.recalledConversation('different-viewer', 12), null)
    assert.deepEqual(JSON.parse(calls[0].options.body as string), { professionalId: 'professional-uuid' })
})
test('malformed session data does not break chat selection', () => {
    storage.set('oficiosya_chat_viewer_12', '{bad')
    assert.equal(service.recalledConversation('viewer', 12), null)
})
test('block and unblock use POST and DELETE on the existing endpoint', async () => {
    responseBody = conversation
    await service.setConversationBlocked(12, true)
    await service.setConversationBlocked(12, false)
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
        await assert.rejects(service.markRead(12, 345))
        assert.equal(changes, 0)
        status = 204
        await service.markRead(12, 345)
        assert.equal(changes, 1)
        assert.deepEqual(JSON.parse(calls[1].options.body as string), { lastReadMessageId: 345 })
    } finally { events.removeEventListener('oficiosya:chat-read', follow) }
})
