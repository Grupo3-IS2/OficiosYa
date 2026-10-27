import { useState } from 'react'
import type { SubmitEvent } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import { acceptJobRequest, rejectJobRequest } from '../../services/jobRequestService'
import { getProfessionalSchedule } from '../../services/scheduleService'
import type { JobRequest } from '../../types/JobRequest'
import OutsideAvailabilityModal from './OutsideAvailabilityModal'
import { rescheduleDraftFrom } from './rescheduleForm'
import { timeframeText } from './rescheduleTimeframe'
import { REASON_MAX_LENGTH, acceptanceTimeframe, optionalReason, withinAvailability, type RequestOutcome } from './requestResponse'

type Mode = 'choosing' | 'accepting' | 'rejecting'

/** Opening the detail from the card's "Aceptar" or "Rechazar" goes straight to that form. */
export type ResponseMode = Exclude<Mode, 'choosing'>

/**
 * The professional's answer to a PROPOSED request, first thing in the detail: the client is waiting.
 * Accepting asks for the timeframe, which goes into their agenda; rejecting takes an optional
 * reason that the client gets to see.
 */
export default function RequestResponseSection({ request, initialMode, onAnswered, onBusyChange }: Readonly<{
    request: JobRequest
    initialMode?: ResponseMode
    onAnswered: (updated: JobRequest, outcome: RequestOutcome) => void
    onBusyChange: (busy: boolean) => void
}>) {
    const [mode, setMode] = useState<Mode>(initialMode ?? 'choosing')
    // Starts from the timeframe the client asked for: the professional confirms it or changes it
    const [draft, setDraft] = useState(() => rescheduleDraftFrom(request.proposedStart, request.proposedEnd))
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    // A timeframe outside the professional's availability, waiting for the user to confirm it
    const [unavailable, setUnavailable] = useState<{ start: Date; end: Date } | null>(null)

    function switchTo(next: Mode) {
        setError('')
        setMode(next)
    }

    async function send(action: () => Promise<JobRequest>, outcome: RequestOutcome) {
        setBusy(true)
        onBusyChange(true)
        setError('')
        try {
            onAnswered(await action(), outcome)
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No se pudo enviar tu respuesta. Intentá nuevamente.')
        } finally {
            setBusy(false)
            onBusyChange(false)
        }
    }

    async function accept(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        const timeframe = acceptanceTimeframe(draft)
        if ('error' in timeframe) {
            setError(timeframe.error)
            return
        }
        setError('')
        // shortcut: an agenda that can't be loaded skips the warning; the backend still rejects real clashes
        const available = await getProfessionalSchedule(request.professionalId, timeframe.start, timeframe.end)
            .then(schedules => withinAvailability(schedules, timeframe.start, timeframe.end), () => true)
        if (available) book(timeframe)
        else setUnavailable(timeframe)
    }

    function book(timeframe: { start: Date; end: Date }) {
        setUnavailable(null)
        void send(() => acceptJobRequest(request.id, timeframe.start, timeframe.end), 'accepted')
    }

    function reject(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        const result = optionalReason(reason)
        if ('error' in result) {
            setError(result.error)
            return
        }
        void send(() => rejectJobRequest(request.id, result.reason), 'rejected')
    }

    const recommended = request.proposedStart && request.proposedEnd
        ? <p className="request-response__recommended">Horario recomendado por {request.clientName}: <strong>{timeframeText(request.proposedStart, request.proposedEnd)}</strong></p>
        : null

    return <section className="request-callout request-callout--urgent request-response" aria-labelledby="request-response-title" aria-busy={busy}>
        <div className="request-callout__heading">
            <Icon name="calendar" />
            <div>
                <h3 id="request-response-title">Responder solicitud</h3>
                <strong>{request.clientName} espera tu respuesta</strong>
            </div>
        </div>

        {mode === 'choosing' && <>
            <p>Si la aceptás, elegí cuándo vas a hacer el trabajo: queda reservado en tu agenda.</p>
            {recommended}
            <div className="request-response__actions">
                <Button type="button" variant="ghost" className="request-detail-reject" onClick={() => switchTo('rejecting')}>Rechazar</Button>
                <Button type="button" onClick={() => switchTo('accepting')}>Aceptar</Button>
            </div>
        </>}

        {mode === 'accepting' && <form className="request-response__form" onSubmit={event => { void accept(event) }}>
            <p>¿Cuándo vas a hacer el trabajo? {request.clientName} lo va a ver en su solicitud.</p>
            {recommended}
            <label className="request-response__field request-response__field--wide">
                Fecha
                <input type="date" required autoFocus value={draft.date} disabled={busy}
                    onChange={event => setDraft(previous => ({ ...previous, date: event.target.value }))} />
            </label>
            <label className="request-response__field">
                Desde
                <input type="time" required step={900} value={draft.startTime} disabled={busy}
                    onChange={event => setDraft(previous => ({ ...previous, startTime: event.target.value }))} />
            </label>
            <label className="request-response__field">
                Hasta
                <input type="time" required step={900} value={draft.endTime} disabled={busy}
                    onChange={event => setDraft(previous => ({ ...previous, endTime: event.target.value }))} />
            </label>
            {error && <p className="request-response__error" role="alert">{error}</p>}
            <div className="request-response__actions">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => switchTo('choosing')}>Volver</Button>
                <Button type="submit" disabled={busy}>{busy ? 'Aceptando…' : 'Confirmar y aceptar'}</Button>
            </div>
        </form>}
        {unavailable && <OutsideAvailabilityModal onConfirm={() => book(unavailable)} onCancel={() => setUnavailable(null)} />}

        {mode === 'rejecting' && <form className="request-response__form" onSubmit={reject}>
            <label className="request-response__field request-response__field--wide">
                Motivo (opcional)
                <textarea rows={3} autoFocus maxLength={REASON_MAX_LENGTH} value={reason} disabled={busy}
                    placeholder={`Contale a ${request.clientName} por qué no podés tomar el trabajo.`}
                    onChange={event => setReason(event.target.value)} />
            </label>
            {error && <p className="request-response__error" role="alert">{error}</p>}
            <div className="request-response__actions">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => switchTo('choosing')}>Volver</Button>
                <Button type="submit" className="request-response__reject" disabled={busy}>{busy ? 'Rechazando…' : 'Confirmar rechazo'}</Button>
            </div>
        </form>}
    </section>
}
