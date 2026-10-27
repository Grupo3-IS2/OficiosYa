import { apiRequest } from './api.ts'
import type { JobStatus, JobTask, RequestParty } from '../types/JobRequest'

export interface Conversation {
  id: number
  otherParticipant: { id: string, name: string, profileImageUrl: string | null, role: RequestParty }
  myRole: RequestParty
  lastMessagePreview: string | null
  lastMessageAt: string | null
  unreadCount: number
  canWrite: boolean
  blockedByMe: boolean
}

export interface ChatJobSummary {
  id: number
  status: JobStatus
  proposedBy: RequestParty
  tasks: JobTask[]
  location: string
  paymentAmount: number
  start: string | null
  end: string | null
  rescheduleStart: string | null
  rescheduleEnd: string | null
}

export interface ChatMessage {
  id: number
  conversationId: number
  type: 'TEXT' | 'JOB_PROPOSAL'
  senderId: string
  content: string | null
  clientMessageId: string
  jobRequestId: number | null
  job: ChatJobSummary | null
  createdAt: string
}

/** Keep the opening response: empty threads are deliberately absent from the inbox API. */
export function rememberConversation(ownerId: string, conversation: Conversation): void {
  try { sessionStorage.setItem(`oficiosya_chat_${ownerId}_${conversation.id}`, JSON.stringify(conversation)) } catch { /* Storage can be unavailable. */ }
}

export function recalledConversation(ownerId: string, id: number): Conversation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`oficiosya_chat_${ownerId}_${id}`) ?? 'null') as Conversation | null
    return value?.id === id && typeof value.otherParticipant?.id === 'string'
      && typeof value.otherParticipant.name === 'string' && typeof value.canWrite === 'boolean' ? value : null
  } catch { return null }
}

export async function openConversation(professionalId: string, ownerId?: string) {
  const conversation = await apiRequest<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ professionalId }) })
  if (ownerId) rememberConversation(ownerId, conversation)
  return conversation
}

export function getConversations() {
  return apiRequest<Conversation[]>('/conversations')
}

/** Newest first. */
export function getMessages(conversationId: number, before?: number, limit = 40) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (before !== undefined) params.set('before', String(before))
  return apiRequest<ChatMessage[]>(`/conversations/${conversationId}/messages?${params}`)
}

export function sendMessage(conversationId: number, content: string, clientMessageId: string = crypto.randomUUID()) {
  return apiRequest<ChatMessage>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, clientMessageId }),
  })
}

export async function markRead(conversationId: number, lastReadMessageId: number) {
  await apiRequest<void>(`/conversations/${conversationId}/read`, { method: 'POST', body: JSON.stringify({ lastReadMessageId }) })
  window.dispatchEvent(new Event('oficiosya:chat-read'))
}

export function setConversationBlocked(conversationId: number, blocked: boolean) {
  return apiRequest<Conversation>(`/conversations/${conversationId}/block`, { method: blocked ? 'POST' : 'DELETE' })
}

export function getUnreadCount() {
  return apiRequest<{ count: number }>('/conversations/unread-count').then(response => response.count)
}
