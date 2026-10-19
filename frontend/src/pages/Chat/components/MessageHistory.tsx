import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import Icon from '../../../components/Icon/Icon'
import type { ChatMessage, ChatJobSummary } from '../../../services/chatService'
import { dateKey, dateLabel, jobStatusLabels, messageTime } from '../chatModel'

export default function MessageHistory({ messages, me, loading, loadingOlder, hasOlder, error, onRetry, onLoadOlder, onTailVisible }: Readonly<{
    messages: ChatMessage[]; me: string; loading: boolean; loadingOlder: boolean; hasOlder: boolean; error: string
    onRetry: () => void; onLoadOlder: () => Promise<void>; onTailVisible: (visible: boolean) => void
}>) {
    const history = useRef<HTMLDivElement>(null)
    const tail = useRef<HTMLDivElement>(null)
    const following = useRef(true)
    const initialized = useRef(false)
    const anchor = useRef<{ id: string; offset: number } | null>(null)
    const previousLatest = useRef<number | undefined>(undefined)

    useEffect(() => {
        const root = history.current
        const target = tail.current
        if (!root || !target) return
        const observer = new IntersectionObserver(entries => onTailVisible(entries[0].isIntersecting), { root, threshold: 1 })
        observer.observe(target)
        return () => { observer.disconnect(); onTailVisible(false) }
    }, [onTailVisible])

    useLayoutEffect(() => {
        const root = history.current
        if (!root || loading) return
        if (anchor.current) {
            const saved = anchor.current
            const element = root.querySelector<HTMLElement>(`[data-message-id="${saved.id}"]`)
            if (element) root.scrollTop += element.getBoundingClientRect().top - root.getBoundingClientRect().top - saved.offset
            if (!loadingOlder) anchor.current = null
        } else if (!initialized.current || following.current || (messages.at(-1)?.senderId === me && messages.at(-1)?.id !== previousLatest.current)) {
            root.scrollTop = root.scrollHeight
        }
        initialized.current = true
        previousLatest.current = messages.at(-1)?.id
    }, [messages, loading, loadingOlder, me])

    useEffect(() => { if (error && !loadingOlder) anchor.current = null }, [error, loadingOlder])

    async function older() {
        const root = history.current
        if (!root || loadingOlder) return
        const firstVisible = [...root.querySelectorAll<HTMLElement>('[data-message-id]')].find(element => element.getBoundingClientRect().bottom > root.getBoundingClientRect().top)
        if (firstVisible) anchor.current = { id: firstVisible.dataset.messageId!, offset: firstVisible.getBoundingClientRect().top - root.getBoundingClientRect().top }
        following.current = false
        await onLoadOlder()
    }

    return <div className="chat-history" ref={history} role="region" aria-label="Historial de mensajes" aria-busy={loading}
        onScroll={event => { const root = event.currentTarget; following.current = root.scrollHeight - root.scrollTop - root.clientHeight < 48 }}>
        {error && <div className="chat-notice" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Reintentar</button></div>}
        {loading && <div className="chat-history-state" role="status">Cargando mensajes…</div>}
        {!loading && !error && !messages.length && <div className="chat-history-state"><Icon name="message" /><h2>La conversación empieza acá</h2><p>Escribí un mensaje para coordinar el servicio.</p></div>}
        {hasOlder && <button className="chat-load-older" type="button" disabled={loadingOlder} onClick={() => void older()}>{loadingOlder ? 'Cargando…' : 'Cargar mensajes anteriores'}</button>}
        {messages.map((message, index) => {
            const previous = messages[index - 1]
            const newDate = !previous || dateKey(previous.createdAt) !== dateKey(message.createdAt)
            const own = message.senderId === me
            return <Fragment key={message.id}>
                {newDate && <div className="chat-date"><span>{dateLabel(message.createdAt)}</span></div>}
                <div data-message-id={message.id} className={`chat-message-row${own ? ' chat-message-row--own' : ''}${!newDate && previous?.senderId !== message.senderId ? ' chat-message-row--new-sender' : ''}`}>
                    {message.type === 'JOB_PROPOSAL'
                        ? <JobProposalCard job={message.job} jobRequestId={message.jobRequestId} createdAt={message.createdAt} />
                        : <TextMessageBubble message={message} />}
                </div>
            </Fragment>
        })}
        <div ref={tail} className="chat-history-tail" aria-hidden="true" />
    </div>
}

function TextMessageBubble({ message }: Readonly<{ message: ChatMessage }>) {
    return <div className="chat-bubble"><span>{message.content}</span><time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time></div>
}

function JobProposalCard({ job, jobRequestId, createdAt }: Readonly<{ job: ChatJobSummary | null; jobRequestId: number | null; createdAt: string }>) {
    const id = job?.id ?? jobRequestId
    return <article className="chat-job-card" aria-label="Solicitud de servicio">
        <span className="chat-job-card__icon"><Icon name="document" /></span>
        <div className="chat-job-card__body"><h3>Solicitud de servicio</h3>
            {job && <>
                <strong className={`chat-job-status chat-job-status--${job.status.toLowerCase()}`}>{jobStatusLabels[job.status] ?? job.status}</strong>
                <div className="chat-job-tasks">{job.tasks.map(task => <div key={task.id}><p>{task.tradeName}</p>{task.description && <p>{task.description}</p>}</div>)}</div>
                {job.paymentAmount !== null && job.paymentAmount !== undefined && <p>Monto propuesto: <b>{new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 2 }).format(job.paymentAmount)}</b></p>}
            </>}
            {id && <a href={`/mis-solicitudes?request=${id}`}>Ver solicitud <span aria-hidden="true">→</span></a>}
            {!job && <p>Consultá el detalle de la solicitud.</p>}
            <time dateTime={createdAt}>{messageTime(createdAt)}</time>
        </div>
    </article>
}
