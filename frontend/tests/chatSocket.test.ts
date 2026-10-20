import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TOKEN_KEY } from '../src/services/session.ts'
import { onChatEvent } from '../src/services/chatSocket.ts'

class MemoryStorage {
    private values = new Map<string, string>()
    getItem(key: string) { return this.values.get(key) ?? null }
    setItem(key: string, value: string) { this.values.set(key, value) }
    removeItem(key: string) { this.values.delete(key) }
    clear() { this.values.clear() }
}

class FakeWebSocket {
    static instances: FakeWebSocket[] = []
    readonly url: string
    onopen: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onclose: (() => void) | null = null
    sent: string[] = []
    closed = false

    constructor(url: string) {
        this.url = url
        FakeWebSocket.instances.push(this)
    }

    send(message: string) { this.sent.push(message) }
    close() { this.closed = true }
}

test('chat socket authenticates, subscribes, emits events and closes after last listener', async () => {
    const originalStorage = globalThis.localStorage
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLocation = globalThis.location
    const storage = new MemoryStorage()
    storage.setItem(TOKEN_KEY, 'header.eyJleHAiOjQxMDAwMDAwMDB9.signature')
    const documentListeners = new Map<string, () => void>()
    globalThis.localStorage = storage as unknown as Storage
    globalThis.window = {
        setTimeout,
        clearTimeout,
        location: { protocol: 'http:', host: 'localhost' },
    } as unknown as Window & typeof globalThis
    globalThis.location = { protocol: 'http:', host: 'localhost' } as Location
    globalThis.document = {
        visibilityState: 'hidden',
        addEventListener: (type: string, listener: () => void) => documentListeners.set(type, listener),
        removeEventListener: (type: string) => documentListeners.delete(type),
    } as unknown as Document
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

    const events: string[] = []
    const unsubscribe = onChatEvent(event => events.push(event))
    await new Promise(resolve => setImmediate(resolve))
    const socket = FakeWebSocket.instances.at(-1)
    assert.ok(socket)
    assert.equal(socket.url, 'ws://localhost/ws/chat')

    socket.onopen?.()
    assert.match(socket.sent[0], /^CONNECT\n/)
    socket.onmessage?.({ data: 'CONNECTED\n\n\0' })
    assert.match(socket.sent[1], /SUBSCRIBE/)
    assert.match(socket.sent[2], /job-updates/)
    socket.onmessage?.({ data: 'MESSAGE\ndestination:/user\/queue\/messages\n\n{"type":"JOB_PROPOSAL"}\0' })
    socket.onmessage?.({ data: 'MESSAGE\ndestination:/user\/queue\/job-updates\n\n{}\0' })
    assert.deepEqual(events, ['message', 'job', 'job'])

    unsubscribe()
    assert.equal(socket.closed, true)
    assert.equal(documentListeners.has('visibilitychange'), false)

    globalThis.localStorage = originalStorage
    globalThis.window = originalWindow
    globalThis.document = originalDocument
    globalThis.location = originalLocation
})
