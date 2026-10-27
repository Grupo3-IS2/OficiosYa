import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon/Icon'
import type { Conversation } from '../../../services/chatService'
import type { Professional } from '../../../types/Professional'
import { ChatAvatar, TradePills } from './ChatIdentity'

export default function ConversationHeader({ conversation, professional, canRequest, busy, onRequest, onBlock, onBack }: Readonly<{
    conversation: Conversation | null; professional?: Professional | null; canRequest: boolean; busy: boolean
    onRequest: () => void; onBlock: () => void; onBack: () => void
}>) {
    const [open, setOpen] = useState(false)
    const menu = useRef<HTMLDivElement>(null)
    const trigger = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (!open) return
        menu.current?.querySelector<HTMLButtonElement | HTMLAnchorElement>('[role="menuitem"]')?.focus()
        const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }
        document.addEventListener('pointerdown', close)
        document.addEventListener('keydown', escape)
        return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
    }, [open])
    const person = conversation?.otherParticipant
    return <header className="chat-conversation-header">
        <button className="chat-icon-button chat-mobile-back" type="button" onClick={onBack} aria-label="Volver a conversaciones"><Icon name="arrow-left" /></button>
        {person && <ChatAvatar name={person.name} src={person.profileImageUrl} />}
        <div className="chat-conversation-header__identity"><h1>{person?.name ?? 'Conversación'}</h1><TradePills professional={professional} /></div>
        {conversation && <div className="chat-menu-anchor" ref={menu}>
            <button ref={trigger} className="chat-icon-button chat-menu-trigger" type="button" aria-label="Opciones de conversación"
                aria-haspopup="menu" aria-expanded={open} aria-controls="chat-options" onClick={() => setOpen(value => !value)}><Icon name="more" /></button>
            {open && <div className="chat-menu" id="chat-options" role="menu" aria-label="Opciones de conversación"
                onKeyDown={event => {
                    if (event.key === 'Tab') setOpen(false)
                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
                    event.preventDefault()
                    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
                    const index = items.indexOf(document.activeElement as HTMLElement)
                    items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
                }}>
                {professional && <a role="menuitem" href={`/profesionales/${encodeURIComponent(professional.id)}`} onClick={() => setOpen(false)}><Icon name="user" />Ver perfil profesional</a>}
                {canRequest && <button role="menuitem" type="button" onClick={() => { setOpen(false); onRequest() }}><Icon name="document" />Solicitar servicio</button>}
                <button className="chat-menu__block" role="menuitem" type="button" disabled={busy} onClick={() => { setOpen(false); onBlock() }}>
                    <Icon name="ban" />{busy ? 'Actualizando…' : conversation.blockedByMe ? 'Desbloquear conversación' : 'Bloquear conversación'}
                </button>
            </div>}
        </div>}
    </header>
}
