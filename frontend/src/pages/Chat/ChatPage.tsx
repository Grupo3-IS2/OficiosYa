import { useEffect, useState } from 'react'
import Icon from '../../components/Icon/Icon'
import { getCurrentUser } from '../../services/authService'
import { useChatInbox } from './hooks/useChatInbox'
import { useChatProfiles } from './hooks/useChatProfiles'
import ChatSidebar from './components/ChatSidebar'
import ConversationPanel from './components/ConversationPanel'
import './ChatPage.css'

export default function ChatPage() {
    const me = getCurrentUser()?.id ?? ''
    const inbox = useChatInbox(me)
    const [collapsed, setCollapsed] = useState(false)
    const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches)
    const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined)
    useEffect(() => {
        const media = window.matchMedia('(max-width: 700px)')
        const resize = () => {
            setMobile(media.matches)
            // The visual viewport shrinks with the on-screen keyboard on browsers where dvh does not.
            setViewportHeight(media.matches && window.visualViewport?.scale === 1 ? window.visualViewport.height : undefined)
        }
        resize()
        media.addEventListener('change', resize)
        window.visualViewport?.addEventListener('resize', resize)
        return () => { media.removeEventListener('change', resize); window.visualViewport?.removeEventListener('resize', resize) }
    }, [])
    const sidebarCollapsed = collapsed && !mobile
    const profiles = useChatProfiles(me, inbox.conversations.map(conversation => conversation.otherParticipant.id))
    return <main style={viewportHeight ? { height: viewportHeight } : undefined} className={`chat-page${sidebarCollapsed ? ' chat-page--collapsed' : ''}${inbox.selectedId ? ' chat-page--selected' : ''}`}>
        <ChatSidebar conversations={inbox.conversations} selectedId={inbox.selectedId} onSelect={inbox.select} collapsed={sidebarCollapsed}
            onToggle={() => setCollapsed(value => !value)} profiles={profiles} loading={inbox.loading} error={inbox.error} onRetry={() => void inbox.refresh()} />
        {inbox.selectedId ? <ConversationPanel key={inbox.selectedId} id={inbox.selectedId} conversation={inbox.selected}
            professional={inbox.selected ? profiles[inbox.selected.otherParticipant.id] : null} me={me}
            onBack={() => inbox.select(null)} onRefresh={inbox.refresh} onReplace={inbox.replace} />
            : <section className="chat-panel chat-welcome"><Icon name="message" /><h1>Tus conversaciones, en un solo lugar</h1>
                <p>Elegí un contacto para conversar y coordinar tu próximo servicio.</p></section>}
    </main>
}
