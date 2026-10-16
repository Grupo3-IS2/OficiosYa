import { apiRequest } from './api'

export interface Conversation {
  id: number
  otherParticipant: { id: string, name: string }
  lastMessagePreview: string | null
  unreadCount: number
  canWrite: boolean
}

export interface ChatMessage {
  id: number
  type: 'TEXT' | 'JOB_PROPOSAL'
  senderId: string
  content: string | null
  job: { status: string } | null
  createdAt: string
}

export function openConversation(professionalId: string) {
  return apiRequest<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ professionalId }) })
}

export function getConversations() {
  return apiRequest<Conversation[]>('/conversations')
}

/** Newest first. */
export function getMessages(conversationId: number) {
  return apiRequest<ChatMessage[]>(`/conversations/${conversationId}/messages?limit=100`)
}

export function sendMessage(conversationId: number, content: string) {
  return apiRequest<ChatMessage>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, clientMessageId: crypto.randomUUID() }),
  })
}

export function markRead(conversationId: number, lastReadMessageId: number) {
  return apiRequest<void>(`/conversations/${conversationId}/read`, { method: 'POST', body: JSON.stringify({ lastReadMessageId }) })
}

export function getUnreadCount() {
  return apiRequest<{ count: number }>('/conversations/unread-count').then(response => response.count)
}
