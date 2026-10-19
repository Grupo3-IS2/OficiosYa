import type { ChatMessage, Conversation } from '../../services/chatService.ts'

export function conversationIdFromSearch(search: string): number | null {
    const id = Number(new URLSearchParams(search).get('c'))
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** A refreshed message replaces its old proposal snapshot; history always stays chronological. */
export function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
    const messages = new Map(previous.map(message => [message.id, message]))
    incoming.forEach(message => messages.set(message.id, message))
    return [...messages.values()].sort((a, b) => a.id - b.id)
}

export function filterConversations(conversations: Conversation[], query: string): Conversation[] {
    const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-UY')
    return conversations.filter(conversation => normalize(conversation.otherParticipant.name).includes(normalize(query.trim())))
}

const zone = 'America/Montevideo'
export function dateKey(value: string | Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
export function dateLabel(value: string, now = new Date()): string {
    if (dateKey(value) === dateKey(now)) return 'Hoy'
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (dateKey(value) === dateKey(yesterday)) return 'Ayer'
    return new Intl.DateTimeFormat('es-UY', { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}
export function messageTime(value: string): string {
    return new Intl.DateTimeFormat('es-UY', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
}
export function activityLabel(value: string | null): string {
    if (!value) return ''
    if (dateKey(value) === dateKey(new Date())) return messageTime(value)
    if (dateLabel(value) === 'Ayer') return 'Ayer'
    return new Intl.DateTimeFormat('es-UY', { timeZone: zone, day: 'numeric', month: 'short' }).format(new Date(value))
}

export const jobStatusLabels: Record<string, string> = {
    PROPOSED: 'Pendiente', ACCEPTED: 'Aceptada', RESCHEDULE_REQUESTED: 'Cambio de horario pendiente',
    COMPLETED: 'Completada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', EXPIRED: 'Vencida',
}
