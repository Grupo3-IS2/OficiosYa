import { useCallback, useEffect, useRef, useState } from 'react'
import { getConversations, recalledConversation, rememberConversation, type Conversation } from '../../../services/chatService'
import { onChatEvent } from '../../../services/chatSocket'
import { conversationIdFromSearch } from '../chatModel'

export function useChatInbox(ownerId: string) {
    const [selectedId, setSelectedId] = useState(() => conversationIdFromSearch(window.location.search))
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const generation = useRef(0)
    const mounted = useRef(false)
    const refresh = useCallback(async () => {
        const request = ++generation.current
        try {
            const inbox = await getConversations()
            if (!mounted.current || request !== generation.current) return
            inbox.forEach(conversation => rememberConversation(ownerId, conversation))
            setConversations(inbox)
            setError('')
        } catch (reason) {
            if (mounted.current && request === generation.current) setError((reason as Error).message)
        } finally {
            if (mounted.current && request === generation.current) setLoading(false)
        }
    }, [ownerId])

    useEffect(() => {
        mounted.current = true
        // Start after the subscription is installed; this also coalesces StrictMode's initial mount.
        const initial = window.setTimeout(() => void refresh(), 0)
        const unsubscribe = onChatEvent(() => void refresh())
        const navigate = () => setSelectedId(conversationIdFromSearch(window.location.search))
        window.addEventListener('popstate', navigate)
        return () => { mounted.current = false; window.clearTimeout(initial); unsubscribe(); window.removeEventListener('popstate', navigate) }
    }, [refresh])

    const select = useCallback((id: number | null) => {
        const url = new URL(window.location.href)
        if (id === null) url.searchParams.delete('c')
        else url.searchParams.set('c', String(id))
        window.history.pushState(null, '', url)
        setSelectedId(id)
    }, [])
    const replace = useCallback((conversation: Conversation) => {
        // A list requested before a block/unblock must not overwrite the mutation's response.
        generation.current += 1
        rememberConversation(ownerId, conversation)
        setConversations(previous => previous.some(item => item.id === conversation.id)
            ? previous.map(item => item.id === conversation.id ? conversation : item)
            : [conversation, ...previous])
    }, [ownerId])
    const selected = conversations.find(item => item.id === selectedId)
        ?? (selectedId ? recalledConversation(ownerId, selectedId) : null)
    const listed = selected && !conversations.some(item => item.id === selected.id) ? [selected, ...conversations] : conversations

    return { conversations: listed, selected, selectedId, select, replace, loading, error, refresh }
}
