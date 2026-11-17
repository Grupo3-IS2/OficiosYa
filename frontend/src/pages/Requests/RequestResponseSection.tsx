import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import { acceptJobRequest, rejectJobRequest } from '../../services/jobRequestService'
import { getProfessionalSchedule } from '../../services/scheduleService'
import type { JobRequest } from '../../types/JobRequest'
import BookingCalendar from '../ProfessionalProfile/components/BookingCalendar'
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
    // Hidden until asked for, and kept open or closed between viewing and accepting
    const [showCalendar, setShowCalendar] = useState(false)
    // The timeframe that falls outside the professional's availability, warned about without opening the calendar
    const [outsideKey, setOutsideKey] = useState('')
    const timeframe = acceptanceTimeframe(draft)
    const timeframeKey = 'start' in timeframe ? `${timeframe.start.getTime()}|${timeframe.end.getTime()}` : ''

    useEffect(() => {
        if (!timeframeKey) return
        const [start, end] = timeframeKey.split('|').map(time => new Date(Number(time)))
        let active = true
        // shortcut: an agenda that can't be loaded shows no warning; the backend still rejects real clashes
        void getProfessionalSchedule(request.professionalId, start, end, true)
            .then(schedules => { if (active) setOutsideKey(withinAvailability(schedules, start, end) ? '' : timeframeKey) }, () => undefined)
        return () => { active = false }
    }, [request.professionalId, timeframeKey])

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

    function accept(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        if ('error' in timeframe) {
            setError(timeframe.error)
            return
        }
        // Outside their availability it's still their call: the warning above already told them
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

    const outsideWarning = !showCalendar && timeframeKey && outsideKey === timeframeKey
        ? <div className="request-response__outside" role="status">
            <span aria-hidden="true">!</span>
            <p>Este horario queda fuera de tu disponibilidad. Podés editarlo{mode === 'choosing' ? ' al aceptar la solicitud' : ''}.</p>
            <button type="button" onClick={() => { setError(''); setMode('accepting'); setShowCalendar(true) }}>Editar horario</button>
        </div>
        : null

    const calendarToggle = <button type="button" className="request-response__calendar-toggle" aria-expanded={showCalendar}
        onClick={() => setShowCalendar(open => !open)}>
        <Icon name="calendar" /> {showCalendar ? 'Ocultar calendario' : 'Ver en mi calendario'}
        <Icon name="chevron-down" />
    </button>

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
            {outsideWarning}
            {calendarToggle}
            {showCalendar && <BookingCalendar professionalId={request.professionalId} value={draft} owner readOnly onChange={setDraft} />}
            <div className="request-response__actions">
                <Button type="button" variant="ghost" className="request-detail-reject" onClick={() => switchTo('rejecting')}>Rechazar</Button>
                <Button type="button" onClick={() => switchTo('accepting')}>Aceptar</Button>
            </div>
        </>}

        {mode === 'accepting' && <form className="request-response__form" onSubmit={accept}>
            <p>¿Cuándo vas a hacer el trabajo? {request.clientName} lo va a ver en su solicitud.</p>
            {recommended}
            {outsideWarning}
            {calendarToggle}
            {showCalendar && <BookingCalendar professionalId={request.professionalId} value={draft} owner disabled={busy} onChange={setDraft} />}
            <label className="request-response__field request-response__field--wide">
                Fecha
                <input type="date" required value={draft.date} disabled={busy}
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
