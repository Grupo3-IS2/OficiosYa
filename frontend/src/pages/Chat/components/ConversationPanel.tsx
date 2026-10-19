import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentUser } from '../../../services/authService'
import { markRead, setConversationBlocked, type Conversation } from '../../../services/chatService'
import type { Professional } from '../../../types/Professional'
import ServiceRequestModal from '../../ProfessionalProfile/components/ServiceRequestModal'
import { useChatMessages } from '../hooks/useChatMessages'
import ConversationHeader from './ConversationHeader'
import MessageComposer from './MessageComposer'
import MessageHistory from './MessageHistory'
import { canMarkRead } from '../chatDelivery'

export default function ConversationPanel({ id, conversation, professional, me, onBack, onRefresh, onReplace }: Readonly<{
    id: number; conversation: Conversation | null; professional?: Professional | null; me: string
    onBack: () => void; onRefresh: () => Promise<void>; onReplace: (conversation: Conversation) => void
}>) {
    const chat = useChatMessages(id, () => void onRefresh())
    const [tailVisible, setTailVisible] = useState(false)
    const [focused, setFocused] = useState(() => document.visibilityState === 'visible' && document.hasFocus())
    const [requesting, setRequesting] = useState(false)
    const [blocking, setBlocking] = useState(false)
    const [actionError, setActionError] = useState('')
    const [readError, setReadError] = useState('')
    const [readRetry, setReadRetry] = useState(0)
    const readThrough = useRef(0)
    const readPending = useRef(new Set<number>())
    const mounted = useRef(false)
    const observeTail = useCallback((visible: boolean) => setTailVisible(visible), [])
    const latest = chat.messages.at(-1)?.id
    const user = getCurrentUser()
    const canRequest = Boolean(professional && professional.id !== me && professional.expertiseTrades.length
        && conversation?.canWrite && (user?.role === 'CLIENT' || user?.role === 'PROFESSIONAL'))

    useEffect(() => {
        mounted.current = true
        const visibility = () => setFocused(document.visibilityState === 'visible' && document.hasFocus())
        document.addEventListener('visibilitychange', visibility)
        window.addEventListener('focus', visibility)
        window.addEventListener('blur', visibility)
        return () => { mounted.current = false; document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', visibility); window.removeEventListener('blur', visibility) }
    }, [])

    useEffect(() => {
        if (!latest || !canMarkRead({ latest, readThrough: readThrough.current, tailVisible, focused, covered: requesting,
            loading: chat.loading, error: Boolean(chat.error) }) || readPending.current.has(latest)) return
        readPending.current.add(latest)
        void markRead(id, latest).then(() => {
            readThrough.current = Math.max(readThrough.current, latest)
            if (mounted.current) { setReadError(''); void onRefresh() }
        }).catch(() => { if (mounted.current) setReadError('No pudimos actualizar los mensajes sin leer.') })
            .finally(() => readPending.current.delete(latest))
    }, [id, latest, tailVisible, focused, requesting, chat.loading, chat.error, onRefresh, readRetry])

    async function toggleBlock() {
        if (!conversation || blocking) return
        setBlocking(true)
        setActionError('')
        try {
            const updated = await setConversationBlocked(id, !conversation.blockedByMe)
            if (mounted.current) onReplace(updated)
        } catch (reason) { if (mounted.current) setActionError((reason as Error).message) }
        finally { if (mounted.current) setBlocking(false) }
    }

    return <section className="chat-panel" aria-label="Conversación activa">
        <ConversationHeader conversation={conversation} professional={professional} canRequest={canRequest} busy={blocking}
            onRequest={() => setRequesting(true)} onBlock={() => void toggleBlock()} onBack={onBack} />
        {actionError && <p className="chat-notice" role="alert">{actionError}</p>}
        {readError && <div className="chat-notice" role="alert">{readError} <button type="button" onClick={() => setReadRetry(value => value + 1)}>Reintentar</button></div>}
        {!conversation && !chat.loading && <p className="chat-notice">No tenemos los datos de este contacto. Volvé a abrir el chat desde su perfil o desde Mis solicitudes.</p>}
        <MessageHistory messages={chat.messages} me={me} loading={chat.loading} loadingOlder={chat.loadingOlder} hasOlder={chat.hasOlder}
            error={chat.error} onRetry={() => void chat.refresh()} onLoadOlder={chat.loadOlder} onTailVisible={observeTail} />
        {conversation?.canWrite === false && <div className="chat-blocked" role="status">
            {conversation.blockedByMe ? 'Bloqueaste esta conversación. Podés desbloquearla desde el menú.' : 'Esta conversación está bloqueada. No se pueden enviar mensajes.'}
        </div>}
        <MessageComposer disabled={!conversation?.canWrite || blocking || chat.loading || Boolean(chat.error)} onSend={chat.send} />
        {requesting && professional && <ServiceRequestModal professional={professional} preferredTradeId={null} onClose={() => { setRequesting(false); void onRefresh(); void chat.refresh() }} />}
    </section>
}
