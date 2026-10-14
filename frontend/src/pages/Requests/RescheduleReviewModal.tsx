import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import { acceptReschedule, rejectReschedule } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import { rescheduleRequester } from './requestList'
import type { Decision } from './requestResponse'
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

/**
 * The side that didn't ask already chose to accept or reject the reschedule: this shows the change
 * that choice applies to, the agreed timeframe against the proposed one, before confirming it.
 */
export default function RescheduleReviewModal({ request, decision, onAnswered, onClose }: Readonly<{
    request: JobRequest
    decision: Decision
    onAnswered: (updated: JobRequest, accepted: boolean) => void
    onClose: () => void
}>) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [busy, setBusy] = useState(false)
    const accept = decision === 'accept'
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

    const confirm = async () => {
        setBusy(true)
        setError('')
        try {
            onAnswered(await (accept ? acceptReschedule(request.id) : rejectReschedule(request.id)), accept)
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo responder. Intentá nuevamente.')
            setBusy(false)
        }
    }

    const requester = rescheduleRequester(request) === 'PROFESSIONAL' ? request.professionalName : request.clientName

    return createPortal(
        <dialog ref={dialog} className="reschedule-modal" aria-labelledby="reschedule-review-title" aria-describedby="reschedule-review-description" aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
            <div className="reschedule-modal__body">
                <h2 id="reschedule-review-title">{accept ? '¿Aceptar el cambio de horario?' : '¿Rechazar el cambio de horario?'}</h2>
                <p id="reschedule-review-description">
                    {requester} pidió mover el trabajo. {accept ? 'El trabajo pasa al nuevo horario.' : 'Se mantiene el horario actual.'}
                </p>
                <div className="reschedule-review__comparison">
                    <Timeframe title="Horario actual" parts={current} changed={changed} tone="current" />
                    <span className="reschedule-review__arrow" aria-hidden="true">→</span>
                    <Timeframe title="Nuevo horario" parts={proposed} changed={changed} tone="proposed" />
                </div>
                {error && <p className="reschedule-modal__error" role="alert">{error}</p>}
                <div className="reschedule-modal__actions">
                    <button type="button" onClick={onClose} disabled={busy}>Volver</button>
                    <Button type="button" className={accept ? undefined : 'reschedule-modal__reject'} onClick={() => { void confirm() }} disabled={busy}>
                        {accept
                            ? busy ? 'Aceptando…' : 'Aceptar cambio'
                            : busy ? 'Rechazando…' : 'Rechazar cambio'}
                    </Button>
                </div>
            </div>
        </dialog>,
        document.body,
    )
}
