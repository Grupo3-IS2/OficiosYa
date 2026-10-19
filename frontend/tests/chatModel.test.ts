import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conversationIdFromSearch, dateKey, dateLabel, filterConversations, mergeMessages, messageTime } from '../src/pages/Chat/chatModel.ts'
import { canMarkRead, sendAttempt } from '../src/pages/Chat/chatDelivery.ts'
import type { ChatMessage, Conversation } from '../src/services/chatService.ts'
import type { JobStatus } from '../src/types/JobRequest.ts'

const message = (id: number, status: JobStatus = 'PROPOSED'): ChatMessage => ({ id, conversationId: 12, senderId: 'sender', type: 'JOB_PROPOSAL', content: null,
    clientMessageId: `message-${id}`, jobRequestId: 4, job: { id: 4, status, proposedBy: 'CLIENT', tasks: [], location: '', paymentAmount: 0,
        start: null, end: null, rescheduleStart: null, rescheduleEnd: null }, createdAt: '2026-10-19T15:00:00Z' })

test('conversation selection rejects missing, fractional, negative, unsafe and malformed ids', () => {
    assert.equal(conversationIdFromSearch('?c=12'), 12)
    for (const search of ['', '?c=0', '?c=-1', '?c=1.5', '?c=abc', '?c=9007199254740992']) assert.equal(conversationIdFromSearch(search), null)
})
test('descending pages become chronological without duplicates at the cursor boundary', () => {
    assert.deepEqual(mergeMessages([message(4), message(3)], [message(3), message(2), message(1)]).map(item => item.id), [1, 2, 3, 4])
})
test('a job update replaces the old proposal snapshot without losing loaded history', () => {
    const merged = mergeMessages([message(1), message(2)], [message(2, 'ACCEPTED'), message(3)])
    assert.equal(merged[1].job?.status, 'ACCEPTED')
    assert.equal(merged.length, 3)
})
test('local contact search handles accents and does not search message previews', () => {
    const contacts = [{ id: 1, otherParticipant: { name: 'María Rodríguez' }, lastMessagePreview: 'Andrés' },
        { id: 2, otherParticipant: { name: 'Andrés Silva' }, lastMessagePreview: 'María' }] as Conversation[]
    assert.deepEqual(filterConversations(contacts, ' MARIA ').map(item => item.id), [1])
    assert.deepEqual(filterConversations(contacts, 'silva').map(item => item.id), [2])
    assert.equal(filterConversations(contacts, 'nadie').length, 0)
})
test('date groups follow Uruguay dates across UTC midnight and year boundaries', () => {
    const now = new Date('2026-01-01T03:30:00Z')
    assert.equal(dateLabel('2026-01-01T03:01:00Z', now), 'Hoy')
    assert.equal(dateLabel('2026-01-01T02:59:00Z', now), 'Ayer')
    assert.equal(dateKey('2026-01-01T02:59:00Z'), '2025-12-31')
    assert.equal(messageTime('2026-10-19T15:07:00Z'), '12:07')
})
test('an uncertain send reuses its UUID and a changed payload gets a new one', () => {
    let calls = 0
    const createId = () => `id-${++calls}`
    const first = sendAttempt(null, ' Hola ', createId)
    assert.deepEqual(first, { content: 'Hola', id: 'id-1' })
    assert.equal(sendAttempt(first, 'Hola', createId), first)
    assert.equal(calls, 1)
    assert.equal(sendAttempt(first, 'Otro mensaje', createId).id, 'id-2')
})
test('loading a history alone never counts as having read it', () => {
    const visible = { latest: 10, readThrough: 0, tailVisible: true, focused: true, covered: false, loading: false, error: false }
    assert.equal(canMarkRead(visible), true)
    for (const change of [{ tailVisible: false }, { focused: false }, { covered: true }, { loading: true }, { error: true }, { latest: undefined }, { readThrough: 10 }, { readThrough: 11 }]) {
        assert.equal(canMarkRead({ ...visible, ...change }), false)
    }
})
