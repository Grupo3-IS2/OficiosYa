import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import { requestReschedule } from '../../services/jobRequestService'
import { getProfessionalSchedule } from '../../services/scheduleService'
import type { JobRequest } from '../../types/JobRequest'
import { rescheduleDraftFrom, rescheduleTimeframe } from './rescheduleForm'
import OutsideAvailabilityModal from './OutsideAvailabilityModal'
import { withinAvailability } from './requestResponse'
import './RescheduleModal.css'

export default function RescheduleModal({ request, onRescheduled, onClose }: Readonly<{
    request: JobRequest
    onRescheduled: (updated: JobRequest) => void
    onClose: () => void
}>) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [initialDraft] = useState(() => rescheduleDraftFrom(request.scheduledStart, request.scheduledEnd))
    const [draft, setDraft] = useState(initialDraft)
    const unchanged = draft.date === initialDraft.date && draft.startTime === initialDraft.startTime && draft.endTime === initialDraft.endTime
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    // A timeframe outside the professional's availability, waiting for the user to confirm it
    const [unavailable, setUnavailable] = useState<{ start: Date; end: Date } | null>(null)

    useEffect(() => {
        const previousFocus = document.activeElement
        const element = dialog.current
        if (!element) return
        const previousOverflow = document.body.style.overflow
        element.showModal()
        document.body.style.overflow = 'hidden'
        return () => {
            element.close()
            document.body.style.overflow = previousOverflow
            if (previousFocus instanceof HTMLElement) previousFocus.focus()
        }
    }, [])

    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()
        const timeframe = rescheduleTimeframe(draft, { start: request.scheduledStart, end: request.scheduledEnd })
        if ('error' in timeframe) {
            setError(timeframe.error)
            return
        }

        setBusy(true)
        setError('')
        // shortcut: an agenda that can't be loaded skips the warning; the backend still rejects real clashes
        const available = await getProfessionalSchedule(request.professionalId, timeframe.start, timeframe.end)
            .then(schedules => withinAvailability(schedules, timeframe.start, timeframe.end), () => true)
        if (available) await propose(timeframe)
        else {
            setUnavailable(timeframe)
            setBusy(false)
        }
    }

    const propose = async (timeframe: { start: Date; end: Date }) => {
        setUnavailable(null)
        setBusy(true)
        try {
            onRescheduled(await requestReschedule(request.id, timeframe.start, timeframe.end))
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo reagendar. Intentá nuevamente.')
            setBusy(false)
        }
    }

    return createPortal(
        <dialog ref={dialog} className="reschedule-modal" aria-labelledby="reschedule-title" aria-describedby="reschedule-description" aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
            <form className="reschedule-modal__body" onSubmit={event => { void handleSubmit(event) }}>
                <h2 id="reschedule-title">Reagendar solicitud</h2>
                <label className="reschedule-modal__field reschedule-modal__field--wide">
                    Fecha
                    <input type="date" required value={draft.date} disabled={busy}
                        onChange={event => setDraft(previous => ({ ...previous, date: event.target.value }))} />
                </label>
                <label className="reschedule-modal__field">
                    Desde
                    <input type="time" required step={900} value={draft.startTime} disabled={busy}
                        onChange={event => setDraft(previous => ({ ...previous, startTime: event.target.value }))} />
                </label>
                <label className="reschedule-modal__field">
                    Hasta
                    <input type="time" required step={900} value={draft.endTime} disabled={busy}
                        onChange={event => setDraft(previous => ({ ...previous, endTime: event.target.value }))} />
                </label>
                {error && <p className="reschedule-modal__error" role="alert">{error}</p>}
                <div className="reschedule-modal__actions">
                    <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
                    <Button type="submit" disabled={busy || unchanged} title={unchanged ? 'Cambiá la fecha o el horario para proponer uno nuevo.' : undefined}>{busy ? 'Enviando…' : 'Proponer horario'}</Button>
                </div>
            </form>
            {unavailable && <OutsideAvailabilityModal onConfirm={() => { void propose(unavailable) }} onCancel={() => setUnavailable(null)} />}
        </dialog>,
        document.body,
    )
}
