import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon/Icon'
import { sendAttempt, type SendAttempt } from '../chatDelivery'

export default function MessageComposer({ disabled, onSend }: Readonly<{
    disabled: boolean; onSend: (content: string, clientMessageId: string) => Promise<void>
}>) {
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const failed = useRef<SendAttempt | null>(null)
    const inFlight = useRef(false)
    const input = useRef<HTMLTextAreaElement>(null)
    const focusWhenReady = useRef(true)
    useEffect(() => {
        if (disabled || !focusWhenReady.current) return
        input.current?.focus()
        focusWhenReady.current = false
    }, [disabled])
    useLayoutEffect(() => {
        if (!input.current) return
        input.current.style.height = 'auto'
        input.current.style.height = `${Math.min(input.current.scrollHeight, 144)}px`
    }, [text])

    async function submit() {
        if (disabled || inFlight.current || !text.trim()) return
        const content = text.trim()
        const attempt = sendAttempt(failed.current, content, () => crypto.randomUUID())
        failed.current = attempt
        inFlight.current = true
        setSending(true)
        setError('')
        try {
            await onSend(content, attempt.id)
            failed.current = null
            setText('')
        } catch (reason) { setError((reason as Error).message) }
        finally { inFlight.current = false; setSending(false); input.current?.focus() }
    }
    return <footer className="chat-composer-wrap">
        {error && <div className="chat-send-error" role="alert"><span>{error}</span><button type="button" disabled={disabled || sending} onClick={() => void submit()}>Reintentar</button></div>}
        <form className="chat-composer" onSubmit={event => { event.preventDefault(); void submit() }} aria-busy={sending}>
            <textarea ref={input} rows={1} value={text} disabled={disabled || sending} placeholder="Escribí un mensaje..."
                aria-label="Mensaje" aria-describedby={sending ? 'chat-sending' : undefined}
                onChange={event => { setText(event.target.value); setError('') }}
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() } }} />
            <button className="chat-send" type="submit" disabled={disabled || sending || !text.trim()} aria-label={sending ? 'Enviando mensaje' : 'Enviar mensaje'}>
                <Icon name="send" />
            </button>
            {sending && <span className="chat-sr-only" id="chat-sending" role="status">Enviando mensaje…</span>}
        </form>
    </footer>
}
