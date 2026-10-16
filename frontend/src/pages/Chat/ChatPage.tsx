import { useEffect, useState } from 'react'
import { getCurrentUser } from '../../services/authService'
import { getConversations, getMessages, markRead, sendMessage } from '../../services/chatService'
import { onChatEvent } from '../../services/chatSocket'
import type { ChatMessage, Conversation } from '../../services/chatService'

// shortcut: bare test UI, every push from the socket just reloads over REST; give it a real design later.

export default function ChatPage() {
    const me = getCurrentUser()?.id
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [selected, setSelected] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get('c')) || null)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [text, setText] = useState('')
    const [error, setError] = useState('')
    // Bumped on every push (and after missing some), so the effects below reload.
    const [pushes, setPushes] = useState(0)

    useEffect(() => onChatEvent(() => setPushes(n => n + 1)), [])

    useEffect(() => {
        getConversations().then(setConversations).catch(e => setError(e.message))
    }, [pushes])

    useEffect(() => {
        if (selected === null) return
        getMessages(selected)
            .then(page => {
                setMessages(page)
                if (page.length > 0) void markRead(selected, page[0].id)
            })
            .catch(e => setError(e.message))
    }, [selected, pushes])

    async function send(event: React.FormEvent) {
        event.preventDefault()
        if (selected === null || !text.trim()) return
        try {
            const sent = await sendMessage(selected, text)
            setMessages(previous => [sent, ...previous.filter(m => m.id !== sent.id)])
            setText('')
            setError('')
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const current = conversations.find(c => c.id === selected)

    return (
        <div style={{ display: 'flex', gap: 16, padding: 16, fontFamily: 'sans-serif' }}>
            <div style={{ width: 250 }}>
                <p><a href="/">← Inicio</a></p>
                <h3>Conversaciones</h3>
                {conversations.length === 0 && <p>Sin conversaciones.</p>}
                <ul>
                    {conversations.map(c => (
                        <li key={c.id}>
                            <button type="button" onClick={() => { setMessages([]); setSelected(c.id) }} style={{ fontWeight: c.id === selected ? 'bold' : 'normal' }}>
                                {c.otherParticipant.name} {c.unreadCount > 0 && `(${c.unreadCount})`}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
            <div style={{ flex: 1 }}>
                {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
                {selected === null ? <p>Elegí una conversación.</p> : (
                    <>
                        <h3>{current?.otherParticipant.name ?? `Conversación ${selected}`}</h3>
                        <div style={{ border: '1px solid #ccc', height: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', padding: 8 }}>
                            {messages.map(m => (
                                <p key={m.id} style={{ textAlign: m.senderId === me ? 'right' : 'left', margin: '4px 0' }}>
                                    {m.type === 'JOB_PROPOSAL' ? `[Trabajo propuesto: ${m.job?.status ?? '?'}]` : m.content}
                                    <br /><small>{new Date(m.createdAt).toLocaleString()}</small>
                                </p>
                            ))}
                        </div>
                        <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <input style={{ flex: 1 }} value={text} onChange={e => setText(e.target.value)} disabled={current?.canWrite === false} placeholder="Escribí un mensaje" />
                            <button type="submit" disabled={current?.canWrite === false}>Enviar</button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}
