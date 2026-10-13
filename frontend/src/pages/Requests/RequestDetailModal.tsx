import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import type { JobRequest, JobStatus, PaymentState } from '../../types/JobRequest'
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

const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' })
const dateFormatter = new Intl.DateTimeFormat('es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Montevideo',
})

export default function RequestDetailModal({ request, isClient, pin, onClose }: Readonly<{
    request: JobRequest
    isClient: boolean
    pin: string | null
    onClose: () => void
}>) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const feedbackTimeout = useRef<number | null>(null)
    const [copyFeedback, setCopyFeedback] = useState('')

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
            onCancel={event => { event.preventDefault(); onClose() }}
        >
            <header className="request-detail-modal__header">
                <div>
                    <span>Solicitud #{request.id}</span>
                    <h2 id="request-detail-title">Detalle de la solicitud</h2>
                    <p>{isClient ? 'Profesional' : 'Cliente'}: <strong>{counterpart}</strong></p>
                </div>
                <button type="button" aria-label="Cerrar detalle" onClick={onClose}>
                    <Icon name="close" />
                </button>
            </header>

            <div className="request-detail-modal__body">
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
                        : <p className="request-detail-muted">El profesional todavía no confirmó un horario.</p>}
                    {request.status === 'RESCHEDULE_REQUESTED' && request.rescheduleStart && request.rescheduleEnd && (
                        <p className="request-detail-proposed">Cambio solicitado: {timeframeText(request.rescheduleStart, request.rescheduleEnd)}</p>
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
                <Button type="button" onClick={onClose}>Cerrar</Button>
            </footer>
        </dialog>,
        document.body,
    )
}
