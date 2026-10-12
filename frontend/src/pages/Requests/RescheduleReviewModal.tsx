import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import { acceptReschedule, rejectReschedule } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import { changedParts, timeframeParts, type TimeframePart, type TimeframeParts } from './rescheduleTimeframe'
import './RescheduleModal.css'

function Timeframe({ title, parts, changed, tone }: Readonly<{
    title: string
    parts: TimeframeParts | null
    changed: Set<TimeframePart>
    tone: 'current' | 'proposed'
}>) {
    if (!parts) {
        return <div className={`reschedule-review__timeframe reschedule-review__timeframe--${tone}`}>
            <span className="reschedule-review__title">{title}</span>
            <p>Sin horario</p>
        </div>
    }

    const piece = (part: TimeframePart) => changed.has(part)
        ? <span className="reschedule-review__changed">{parts[part]}</span>
        : parts[part]

    return <div className={`reschedule-review__timeframe reschedule-review__timeframe--${tone}`}>
        <span className="reschedule-review__title">{title}</span>
        <strong>{piece('day')}</strong>
        <p>{piece('startTime')} a {piece('endTime')}</p>
    </div>
}

/** The professional compares the agreed timeframe with the one the client proposes, and answers. */
export default function RescheduleReviewModal({ request, onAnswered, onClose }: Readonly<{
    request: JobRequest
    onAnswered: (updated: JobRequest, accepted: boolean) => void
    onClose: () => void
}>) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
    const [error, setError] = useState('')
    const current = request.scheduledStart && request.scheduledEnd ? timeframeParts(request.scheduledStart, request.scheduledEnd) : null
    const proposed = request.rescheduleStart && request.rescheduleEnd ? timeframeParts(request.rescheduleStart, request.rescheduleEnd) : null
    // Without both timeframes there is nothing to compare: mark none.
    const changed = current && proposed ? changedParts(current, proposed) : new Set<TimeframePart>()

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

    const answer = async (accept: boolean) => {
        setBusy(accept ? 'accept' : 'reject')
        setError('')
        try {
            onAnswered(await (accept ? acceptReschedule(request.id) : rejectReschedule(request.id)), accept)
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo responder. Intentá nuevamente.')
            setBusy(null)
        }
    }

    return createPortal(
        <dialog ref={dialog} className="reschedule-modal" aria-labelledby="reschedule-review-title" aria-describedby="reschedule-review-description" aria-busy={busy !== null}
            onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
            <div className="reschedule-modal__body">
                <h2 id="reschedule-review-title">Cambio de horario</h2>
                <p id="reschedule-review-description">
                    {request.clientName} pidió mover el trabajo.
                </p>
                <div className="reschedule-review__comparison">
                    <Timeframe title="Horario actual" parts={current} changed={changed} tone="current" />
                    <span className="reschedule-review__arrow" aria-hidden="true">→</span>
                    <Timeframe title="Nuevo horario" parts={proposed} changed={changed} tone="proposed" />
                </div>
                {error && <p className="reschedule-modal__error" role="alert">{error}</p>}
                <div className="reschedule-modal__actions">
                    <button type="button" onClick={() => { void answer(false) }} disabled={busy !== null}>
                        {busy === 'reject' ? 'Rechazando…' : 'Rechazar cambio'}
                    </button>
                    <Button type="button" onClick={() => { void answer(true) }} disabled={busy !== null}>
                        {busy === 'accept' ? 'Aceptando…' : 'Aceptar cambio'}
                    </Button>
                </div>
                <button type="button" className="reschedule-review__close" onClick={onClose} disabled={busy !== null}>Decidir después</button>
            </div>
        </dialog>,
        document.body,
    )
}
