import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import ZoneMap from '../../components/ZoneMap/ZoneMap'
import { useZoneLookup } from '../../components/ZoneMap/useZoneLookup'
import type { JobRequest, JobStatus, PaymentState } from '../../types/JobRequest'
import CancelRequestSection from './CancelRequestSection'
import RequestResponseSection, { type ResponseMode } from './RequestResponseSection'
import type { Decision, RequestOutcome } from './requestResponse'
import { answersReschedule, rescheduleRequester } from './requestList'
import { timeframeText } from './rescheduleTimeframe'
import './RequestDetailModal.css'

const statusLabels: Record<JobStatus, string> = {
    PROPOSED: 'Pendiente de respuesta',
    ACCEPTED: 'Aceptada',
    RESCHEDULE_REQUESTED: 'Cambio de horario pendiente',
    REJECTED: 'Rechazada',
    CANCELLED: 'Cancelada',
    COMPLETED: 'Completada',
}

const paymentLabels: Record<PaymentState, string> = {
    PENDING: 'Pendiente',
    RETAINED: 'Retenido',
    PAID: 'Pagado',
    REFUNDED: 'Reintegrado',
}

/** Where the job is done, on the map, so both sides can see how to get there. */
function JobLocationMap({ location }: Readonly<{ location: string }>) {
    const map = useZoneLookup(location)
    if (map.status === 'found') return <ZoneMap focus={map.place} label={`Mapa de ${location}`} />
    return <output className="request-detail-map-placeholder">
        {map.status === 'loading' && 'Buscando la dirección en el mapa…'}
        {map.status === 'not-found' && 'No pudimos ubicar esta dirección en el mapa.'}
        {map.status === 'error' && 'No pudimos cargar el mapa en este momento.'}
    </output>
}

/** timeframeText reads "el jueves, …": without the article it fits after "del", "al" or "para el". */
function withoutArticle(text: string): string {
    return text.replace(/^el /, '')
}

/**
 * What can still be cancelled: anything not finished or already closed. The professional's way out of
 * a request they haven't accepted yet is "Rechazar", so cancelling is only offered to them after that.
 */
const cancellableByClient: JobStatus[] = ['PROPOSED', 'ACCEPTED', 'RESCHEDULE_REQUESTED']
const cancellableByProfessional: JobStatus[] = ['ACCEPTED', 'RESCHEDULE_REQUESTED']

const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' })
const dateFormatter = new Intl.DateTimeFormat('es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Montevideo',
})

export default function RequestDetailModal({ request, isClient, pin, initialResponse, onClose, onAnswered, onReviewReschedule, onReschedule }: Readonly<{
    request: JobRequest
    isClient: boolean
    pin: string | null
    /** Opened from the card's "Aceptar" or "Rechazar": that form comes already open. */
    initialResponse?: ResponseMode
    onClose: () => void
    /** Accepted or rejected by the professional, or cancelled by the client, from here. */
    onAnswered: (updated: JobRequest, outcome: RequestOutcome) => void
    /** Shows the change to confirm accepting or rejecting a reschedule the other side asked for. */
    onReviewReschedule: (request: JobRequest, decision: Decision) => void
    /** Opens the form to propose a new timeframe for an accepted job, over the detail. */
    onReschedule: (request: JobRequest) => void
}>) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const feedbackTimeout = useRef<number | null>(null)
    const [copyFeedback, setCopyFeedback] = useState('')
    // While an answer is on its way the modal stays open, so its outcome isn't lost
    const [answering, setAnswering] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const close = () => { if (!answering) onClose() }
    const needsAnswer = !isClient && request.status === 'PROPOSED'
    const canCancel = (isClient ? cancellableByClient : cancellableByProfessional).includes(request.status)
    const answersChange = answersReschedule(request, isClient ? 'CLIENT' : 'PROFESSIONAL')

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return

        const previousFocus = document.activeElement
        const previousBodyOverflow = document.body.style.overflow
        const previousRootOverflow = document.documentElement.style.overflow
        dialog.showModal()
        document.body.style.overflow = 'hidden'
        document.documentElement.style.overflow = 'hidden'

        return () => {
            if (feedbackTimeout.current !== null) window.clearTimeout(feedbackTimeout.current)
            dialog.close()
            document.body.style.overflow = previousBodyOverflow
            document.documentElement.style.overflow = previousRootOverflow
            if (previousFocus instanceof HTMLElement) previousFocus.focus()
        }
    }, [])

    async function copyPin() {
        if (!pin) return
        try {
            await navigator.clipboard.writeText(pin)
            setCopyFeedback('PIN copiado')
        } catch {
            setCopyFeedback('No se pudo copiar el PIN')
        }
        if (feedbackTimeout.current !== null) window.clearTimeout(feedbackTimeout.current)
        feedbackTimeout.current = window.setTimeout(() => setCopyFeedback(''), 2500)
    }

    const counterpart = isClient ? request.professionalName : request.clientName

    return createPortal(
        <dialog
            ref={dialogRef}
            className="request-detail-modal"
            aria-labelledby="request-detail-title"
            onCancel={event => { event.preventDefault(); close() }}
        >
            <header className="request-detail-modal__header">
                <div>
                    <span>Solicitud #{request.id}</span>
                    <h2 id="request-detail-title">Detalle de la solicitud</h2>
                    <p>{isClient ? 'Profesional' : 'Cliente'}: <strong>{counterpart}</strong></p>
                </div>
                <button type="button" aria-label="Cerrar detalle" onClick={close} disabled={answering}>
                    <Icon name="close" />
                </button>
            </header>

            <div className="request-detail-modal__body">
                {needsAnswer && <RequestResponseSection
                    request={request}
                    initialMode={initialResponse}
                    onAnswered={onAnswered}
                    onBusyChange={setAnswering}
                />}

                {answersChange && <section className="request-callout request-callout--urgent" aria-labelledby="request-reschedule-title">
                    <div className="request-callout__heading">
                        <Icon name="calendar" />
                        <div>
                            <h3 id="request-reschedule-title">Cambio de horario pendiente</h3>
                            <strong>{counterpart} propone mover el trabajo</strong>
                        </div>
                    </div>
                    {request.rescheduleStart && request.rescheduleEnd && <p>
                        {request.scheduledStart && request.scheduledEnd
                            ? <>Del {withoutArticle(timeframeText(request.scheduledStart, request.scheduledEnd))} al </>
                            : 'Para el '}
                        <strong>{withoutArticle(timeframeText(request.rescheduleStart, request.rescheduleEnd))}</strong>.
                    </p>}
                    <div className="request-response__actions">
                        <Button type="button" variant="ghost" className="request-detail-reject" onClick={() => onReviewReschedule(request, 'reject')}>Rechazar</Button>
                        <Button type="button" onClick={() => onReviewReschedule(request, 'accept')}>Aceptar</Button>
                    </div>
                </section>}

                {canCancel && cancelling && <CancelRequestSection
                    request={request}
                    isClient={isClient}
                    onCancelled={(updated, outcome) => {
                        setCancelling(false)
                        onAnswered(updated, outcome)
                    }}
                    onBack={() => setCancelling(false)}
                    onBusyChange={setAnswering}
                />}

                <section className="request-detail-summary" aria-label="Resumen de la solicitud">
                    <div>
                        <span>Estado</span>
                        <strong className={`request-detail-status request-detail-status--${request.status.toLowerCase()}`}>
                            {statusLabels[request.status]}
                        </strong>
                    </div>
                    <div>
                        <span>Monto acordado</span>
                        <strong>{amountFormatter.format(request.paymentAmount)}</strong>
                    </div>
                    <div>
                        <span>Creada</span>
                        <strong>{dateFormatter.format(new Date(request.createdAt))}</strong>
                    </div>
                    {request.paymentState && <div>
                        <span>Pago</span>
                        <strong>{paymentLabels[request.paymentState]}</strong>
                    </div>}
                </section>

                <section className="request-detail-section">
                    <h3>Trabajo</h3>
                    <p className="request-detail-location"><Icon name="location" />{request.location}</p>
                    <div className="request-detail-map"><JobLocationMap location={request.location} /></div>
                    <div className="request-detail-tasks">
                        {request.tasks.map((task, index) => <article key={task.id}>
                            <span>Tarea {index + 1}</span>
                            <strong>{task.tradeName}</strong>
                            <p>{task.description}</p>
                        </article>)}
                    </div>
                </section>

                <section className="request-detail-section">
                    <h3>Horario</h3>
                    {request.scheduledStart && request.scheduledEnd
                        ? <p>{timeframeText(request.scheduledStart, request.scheduledEnd)}</p>
                        : <p className="request-detail-muted">{isClient ? 'El profesional todavía no confirmó un horario.' : 'Lo elegís al aceptar la solicitud.'}</p>}
                    {request.status === 'RESCHEDULE_REQUESTED' && request.rescheduleStart && request.rescheduleEnd && (
                        <p className="request-detail-proposed">
                            Cambio pedido por {(rescheduleRequester(request) === 'CLIENT') === isClient ? 'vos' : counterpart}: {timeframeText(request.rescheduleStart, request.rescheduleEnd)}
                        </p>
                    )}
                </section>

                {(request.rejectionReason || request.cancellationReason) && <section className="request-detail-section">
                    <h3>{request.rejectionReason ? 'Motivo del rechazo' : 'Motivo de cancelación'}</h3>
                    <p>{request.rejectionReason ?? request.cancellationReason}</p>
                </section>}

                {(request.clientEmail || request.professionalPhoneNumber) && <section className="request-detail-section">
                    <h3>Datos de contacto</h3>
                    {request.clientEmail && <p><Icon name="mail" />{request.clientEmail}</p>}
                    {request.professionalPhoneNumber && <p><Icon name="phone" />{request.professionalPhoneNumber}</p>}
                </section>}

                <section className="request-detail-pin" aria-labelledby="request-pin-title">
                    <div>
                        <h3 id="request-pin-title">PIN de confirmación</h3>
                        {isClient && pin && <output>{pin}</output>}
                    </div>
                    {isClient && pin
                        ? <>
                            <p>Mostrale este PIN al profesional cuando el trabajo esté terminado.</p>
                            <Button type="button" variant="ghost" onClick={() => void copyPin()}>
                                <Icon name="copy" /> Copiar PIN
                            </Button>
                            <span className="request-detail-pin__feedback" aria-live="polite">{copyFeedback}</span>
                        </>
                        : isClient
                            ? <p>Este PIN solo se entrega al crear la solicitud. No está disponible en este navegador.</p>
                            : <p>El PIN lo conserva el cliente y debe mostrártelo cuando el trabajo esté terminado.</p>}
                </section>
            </div>

            <footer className="request-detail-modal__footer">
                {canCancel && !cancelling && <Button type="button" variant="ghost" className="request-detail-cancel"
                    onClick={() => setCancelling(true)}>Cancelar solicitud</Button>}
                {/* As on the card: only an accepted job has a timeframe to move, and either side can ask */}
                {request.status === 'ACCEPTED' && !cancelling && <Button type="button" variant="ghost"
                    disabled={answering} onClick={() => onReschedule(request)}>Reagendar</Button>}
                <Button type="button" onClick={close} disabled={answering}>Cerrar</Button>
            </footer>
        </dialog>,
        document.body,
    )
}
