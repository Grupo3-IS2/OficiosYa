import { useCallback, useEffect, useRef, useState } from 'react'
import { getMessages, sendMessage, type ChatMessage } from '../../../services/chatService'
import { onChatEvent } from '../../../services/chatSocket'
import { mergeMessages } from '../chatModel'

const PAGE_SIZE = 40

/** Mounted with a conversation key: late responses cannot enter another thread. */
export function useChatMessages(conversationId: number, onActivity: () => void) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [hasOlder, setHasOlder] = useState(false)
    const [error, setError] = useState('')
    const active = useRef(false)
    const current = useRef<ChatMessage[]>([])
    const running = useRef(false)
    const queued = useRef(false)
    const paging = useRef(false)
    const sendInFlight = useRef(false)

    const refresh = useCallback(async () => {
        if (running.current) { queued.current = true; return }
        running.current = true
        try {
            do {
                queued.current = false
                // Refresh every retained page so old proposal cards receive current job states too.
                const oldest = current.current[0]?.id
                let page = await getMessages(conversationId, undefined, PAGE_SIZE)
                let fetched = page
                while (active.current && oldest !== undefined && page.length === PAGE_SIZE && page[page.length - 1].id > oldest) {
                    page = await getMessages(conversationId, page[page.length - 1].id, PAGE_SIZE)
                    fetched = [...fetched, ...page]
                }
                if (!active.current) return
                if (current.current.length === 0) setHasOlder(page.length === PAGE_SIZE)
                current.current = mergeMessages(current.current, fetched)
                setMessages(current.current)
                setError('')
                setLoading(false)
            } while (queued.current && active.current)
        } catch (reason) {
            if (active.current) { setError((reason as Error).message); setLoading(false) }
        } finally { running.current = false }
    }, [conversationId])

    useEffect(() => {
        active.current = true
        const initial = window.setTimeout(() => void refresh(), 0)
        const unsubscribe = onChatEvent(() => void refresh())
        return () => { active.current = false; window.clearTimeout(initial); unsubscribe() }
    }, [refresh])

    const loadOlder = async () => {
        if (paging.current || !hasOlder || loading) return
        paging.current = true
        setLoadingOlder(true)
        try {
            const page = await getMessages(conversationId, current.current[0]?.id, PAGE_SIZE)
            if (!active.current) return
            current.current = mergeMessages(page, current.current)
            setMessages(current.current)
            setHasOlder(page.length === PAGE_SIZE)
            setError('')
        } catch (reason) { if (active.current) setError((reason as Error).message) }
        finally { paging.current = false; if (active.current) setLoadingOlder(false) }
    }

    const send = async (content: string, clientMessageId: string) => {
        if (sendInFlight.current) return
        sendInFlight.current = true
        try {
            const sent = await sendMessage(conversationId, content, clientMessageId)
            if (!active.current) return
            current.current = mergeMessages(current.current, [sent])
            setMessages(current.current)
        } finally {
            sendInFlight.current = false
            // A rejected send can mean the other participant blocked the thread: refresh permissions too.
            if (active.current) onActivity()
        }
    }
    return { messages, loading, loadingOlder, hasOlder, error, refresh, loadOlder, send }
}
