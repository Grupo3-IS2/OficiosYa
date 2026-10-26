import { useState } from 'react'
import Icon from '../../../components/Icon/Icon'
import type { Conversation } from '../../../services/chatService'
import type { Professional } from '../../../types/Professional'
import { activityLabel, filterConversations } from '../chatModel'
import { ChatAvatar, TradePills } from './ChatIdentity'

export default function ChatSidebar({ conversations, selectedId, onSelect, collapsed, onToggle, profiles, loading, error, onRetry }: Readonly<{
    conversations: Conversation[]; selectedId: number | null; onSelect: (id: number) => void
    collapsed: boolean; onToggle: () => void; profiles: Record<string, Professional | null>
    loading: boolean; error: string; onRetry: () => void
}>) {
    const [query, setQuery] = useState('')
    const visible = collapsed ? conversations : filterConversations(conversations, query)
    return <aside className={`chat-sidebar${collapsed ? ' chat-sidebar--collapsed' : ''}`} aria-label="Conversaciones">
        <div className="chat-sidebar__brand-row">
            <a className="chat-icon-button chat-exit" href="/" aria-label="Volver al inicio"><Icon name="arrow-left" /></a>
            <a className="chat-brand" href="/" aria-label="OficiosYa, volver al inicio"><Icon name="wrench" /><span>OficiosYa</span></a>
            <button className="chat-icon-button chat-collapse" type="button" onClick={onToggle}
                aria-label={collapsed ? 'Expandir conversaciones' : 'Contraer conversaciones'} aria-expanded={!collapsed}>
                <Icon name="chevron-down" />
            </button>
        </div>
        {!collapsed && <label className="chat-search"><Icon name="search" /><input type="search" value={query}
            onChange={event => setQuery(event.target.value)} placeholder="Buscar conversaciones" aria-label="Buscar conversaciones" /></label>}
        {error && <div className="chat-notice" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Reintentar</button></div>}
        <div className="chat-conversation-list" aria-busy={loading}>
            {loading && !conversations.length && <p className="chat-list-state" role="status">Cargando conversaciones…</p>}
            {!loading && !error && !visible.length && <div className="chat-list-state">
                <Icon name="message" /><h2>{query ? 'Sin resultados' : 'Todavía no tenés conversaciones'}</h2>
                <p>{query ? 'Probá con otro nombre.' : 'Buscá un profesional y tocá «Hablar por chat» para empezar.'}</p>
                {!query && <a href="/">Buscar profesionales</a>}
            </div>}
            <ul>{visible.map(conversation => <ConversationListItem key={conversation.id} conversation={conversation}
                selected={conversation.id === selectedId} onSelect={() => onSelect(conversation.id)} collapsed={collapsed}
                professional={profiles[conversation.otherParticipant.id]} />)}</ul>
        </div>
    </aside>
}

function ConversationListItem({ conversation, selected, onSelect, collapsed, professional }: Readonly<{
    conversation: Conversation; selected: boolean; onSelect: () => void; collapsed: boolean; professional?: Professional | null
}>) {
    const person = conversation.otherParticipant
    return <li className="chat-conversation-item">
        <button type="button" className={`chat-contact${selected ? ' is-selected' : ''}`} onClick={onSelect}
            aria-current={selected ? 'true' : undefined} title={collapsed ? person.name : undefined}
            aria-label={`${person.name}${conversation.unreadCount ? `, ${conversation.unreadCount} mensajes sin leer` : ''}`}>
            <span className="chat-contact__avatar"><ChatAvatar name={person.name} src={person.profileImageUrl} />
                {collapsed && conversation.unreadCount > 0 && <span className="chat-unread">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
            </span>
            {!collapsed && <>
                <span className="chat-contact__body"><strong>{person.name}</strong>
                    <span className="chat-contact__preview">{conversation.lastMessagePreview || 'Iniciá la conversación'}</span>
                    <TradePills professional={professional} />
                </span>
                <span className="chat-contact__meta"><time dateTime={conversation.lastMessageAt ?? undefined}>{activityLabel(conversation.lastMessageAt)}</time>
                    {conversation.unreadCount > 0 && <span className="chat-unread">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
                </span>
            </>}
        </button>
    </li>
}
