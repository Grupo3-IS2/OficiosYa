import { useEffect, useState } from 'react'
import { getUnreadCount } from '../../services/chatService'
import { onChatEvent } from '../../services/chatSocket'

/** Unread chat messages, for the alert on the header's "Chat": asked on load and again on every new message or resync. */
export function useUnreadChats(enabled: boolean): number {
    const [count, setCount] = useState(0)

    useEffect(() => {
        if (!enabled) return
        // Without the count there is just no alert: the header works the same
        const refresh = () => { getUnreadCount().then(setCount).catch(() => {}) }
        refresh()
        return onChatEvent(event => { if (event !== 'job') refresh() })
    }, [enabled])

    return enabled ? count : 0
}
