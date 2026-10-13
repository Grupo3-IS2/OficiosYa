import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import BackNavigation from '../../components/BackNavigation/BackNavigation'
import Button from '../../components/Button/Button'
import Header from '../../components/Header/Header'
import Icon from '../../components/Icon/Icon'
import avatarPlaceholder from '../../assets/avatar-placeholder.svg'
import { getCurrentUser } from '../../services/authService'
import { getMyJobRequests } from '../../services/jobRequestService'
import type { JobRequest, JobStatus } from '../../types/JobRequest'
import { filterAndOrderRequests, groupRequestsByDate, localDateKey, requestDescription, serviceSummary, type RequestFilter, type RequestOrder } from './requestList'
import RequestOrderControl from './RequestOrderControl'
import RescheduleModal from './RescheduleModal'
import RescheduleReviewModal from './RescheduleReviewModal'
import { timeframeText } from './rescheduleTimeframe'
import './RequestsPage.css'

const filters: { value: RequestFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'accepted', label: 'Aceptadas' },
    { value: 'completed', label: 'Completadas' },
    { value: 'cancelled', label: 'Canceladas' },
]

/** Which side of the request the viewer is on: /job-requests/mine returns both. */
type Side = 'client' | 'professional'

const statusContent: Record<JobStatus, { label: string; tone: string; detail?: (request: JobRequest, side: Side) => string }> = {
    PROPOSED: {
        label: 'Pendiente de respuesta',
        tone: 'pending',
        detail: (request, side) => side === 'professional'
            ? `${request.clientName} espera tu respuesta.`
            : `Esperando que ${request.professionalName} revise tu solicitud.`,
    },
    ACCEPTED: {
        label: 'Aceptada',
        tone: 'accepted',
        detail: request => request.scheduledStart && request.scheduledEnd
            ? `Programada para ${timeframeText(request.scheduledStart, request.scheduledEnd)}.`
            : '',
    },
    RESCHEDULE_REQUESTED: {
        label: 'Cambio de horario pendiente',
        tone: 'pending',
        detail: (request, side) => {
            const proposed = request.rescheduleStart && request.rescheduleEnd
                ? timeframeText(request.rescheduleStart, request.rescheduleEnd)
                : null
            if (side === 'professional') {
                return proposed
                    ? `${request.clientName} propone ${proposed}.`
                    : `${request.clientName} pidió cambiar el horario.`
            }
            return proposed
                ? `Propusiste ${proposed}. Esperando a ${request.professionalName}.`
                : `Esperando que ${request.professionalName} responda.`
        },
    },
    COMPLETED: { label: 'Completada', tone: 'completed' },
    CANCELLED: { label: 'Cancelada', tone: 'cancelled' },
    REJECTED: { label: 'Rechazada', tone: 'cancelled' },
}

/** Why a request can't be rescheduled: only an accepted job has a timeframe to move. */
const rescheduleUnavailable: Record<JobStatus, string> = {
    PROPOSED: 'Puedes reagendar una vez que el profesional acepte la solicitud.',
    ACCEPTED: '',
    RESCHEDULE_REQUESTED: 'Ya pediste un cambio de horario: esperá la respuesta del profesional.',
    COMPLETED: 'El trabajo ya fue completado.',
    CANCELLED: 'La solicitud fue cancelada.',
    REJECTED: 'La solicitud fue rechazada.',
}

const dateFormatter = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Montevideo' })
const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 })

function groupHeading(dateKey: string): string {
    const formatted = dateFormatter.format(new Date(`${dateKey}T12:00:00-03:00`))
    return dateKey === localDateKey(new Date().toISOString()) ? `Hoy · ${formatted}` : formatted
}

function RequestCard({ request, side, onReschedule, onReviewReschedule }: Readonly<{
    request: JobRequest
    side: Side
    onReschedule: (request: JobRequest) => void
    onReviewReschedule: (request: JobRequest) => void
}>) {
    const status = statusContent[request.status]
    const detail = status.detail?.(request, side)
    const canReschedule = request.status === 'ACCEPTED'
    const answersReschedule = side === 'professional' && request.status === 'RESCHEDULE_REQUESTED'
    // The other side of the job: who the viewer is dealing with.
    const otherName = side === 'professional' ? request.clientName : request.professionalName
    const otherImage = side === 'professional' ? request.clientProfileImageUrl : request.professionalProfileImageUrl

    return <article className="request-card">
        <div className="request-card__professional">
            <img
                src={otherImage || avatarPlaceholder}
                alt={`Foto de ${otherName}`}
                onError={event => { event.currentTarget.src = avatarPlaceholder }}
            />
            <div className="request-card__copy">
                <h3>{serviceSummary(request)}</h3>
                <strong>{otherName}</strong>
                <p>{requestDescription(request)}</p>
                <span><Icon name="location" />{request.location}</span>
            </div>
        </div>
        <div className="request-card__amount">
            <span>Propuesta:</span>
            <strong>{amountFormatter.format(request.paymentAmount)}</strong>
        </div>
        <div className={`request-card__status request-card__status--${status.tone}`}>
            <span className="request-card__status-dot" aria-hidden="true" />
            <strong>{status.label}</strong>
            {detail && <p>{detail}</p>}
        </div>
        <div className="request-card__action">
            <Button type="button" aria-label={`Ver solicitud de ${otherName}`}>Ver solicitud</Button>
            {answersReschedule && <Button type="button" variant="ghost" aria-label={`Ver el cambio de horario que pidió ${otherName}`}
                onClick={() => onReviewReschedule(request)}>Ver cambio</Button>}
            {side === 'client' && <Button type="button" variant="ghost" aria-label={`Reagendar solicitud de ${otherName}`}
                disabled={!canReschedule} title={canReschedule ? undefined : rescheduleUnavailable[request.status]}
                onClick={() => onReschedule(request)}>Reagendar</Button>}
        </div>
    </article>
}

export default function RequestsPage() {
    const [requests, setRequests] = useState<JobRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [activeFilter, setActiveFilter] = useState<RequestFilter>('all')
    const [order, setOrder] = useState<RequestOrder>('newest')
    const [rescheduling, setRescheduling] = useState<JobRequest | null>(null)
    const [reviewing, setReviewing] = useState<JobRequest | null>(null)
    const viewerId = getCurrentUser()?.id
    const replaceRequest = (updated: JobRequest) =>
        setRequests(previous => previous.map(item => item.id === updated.id ? { ...item, ...updated } : item))
    const groups = useMemo(() => groupRequestsByDate(filterAndOrderRequests(requests, activeFilter, order)), [requests, activeFilter, order])

    useEffect(() => {
        let active = true
        void getMyJobRequests()
            .then(response => {
                if (active) setRequests(response)
            })
            .catch(() => {
                if (active) setLoadError(true)
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => { active = false }
    }, [])

    return <div id="top" className="requests-page">
        <Header />
        <main className="requests-page__content">
            <BackNavigation href="/">Volver al inicio</BackNavigation>
            <div className="requests-heading">
                <h1>Mis solicitudes</h1>
            </div>
            <div className="requests-toolbar">
                <div className="requests-filters" aria-label="Filtrar solicitudes">
                    {filters.map(filter => <button
                        key={filter.value}
                        type="button"
                        className={activeFilter === filter.value ? 'is-active' : ''}
                        aria-pressed={activeFilter === filter.value}
                        onClick={() => setActiveFilter(filter.value)}
                    >{filter.label}</button>)}
                </div>
                <RequestOrderControl value={order} onChange={setOrder} />
            </div>

            <section className="request-groups" aria-live="polite">
                {loading
                    ? <output className="requests-feedback">Cargando solicitudes...</output>
                    : loadError
                        ? <div className="requests-feedback" role="alert"><h2>No pudimos cargar tus solicitudes</h2><p>Revisá tu conexión e intentá nuevamente.</p></div>
                        : requests.length === 0
                            ? <div className="requests-empty"><h2>Todavía no tenés solicitudes</h2><p>Cuando solicites un servicio, vas a poder seguirlo desde acá.</p></div>
                            : groups.length === 0
                    ? <div className="requests-empty"><h2>No hay solicitudes en este estado</h2><p>Probá con otro filtro para ver el resto de tus solicitudes.</p></div>
                    : groups.map(group => <section className="request-group" key={group.dateKey}>
                        <h2>{groupHeading(group.dateKey)}</h2>
                        <div className="request-group__items">
                            {group.requests.map(request => <RequestCard key={request.id} request={request}
                                side={request.professionalId === viewerId ? 'professional' : 'client'}
                                onReschedule={setRescheduling} onReviewReschedule={setReviewing} />)}
                        </div>
                    </section>)}
            </section>
        </main>
        {rescheduling && <RescheduleModal
            request={rescheduling}
            onClose={() => setRescheduling(null)}
            onRescheduled={updated => {
                replaceRequest(updated)
                setRescheduling(null)
            }}
        />}
        {reviewing && <RescheduleReviewModal
            request={reviewing}
            onClose={() => setReviewing(null)}
            onAnswered={(updated, accepted) => {
                replaceRequest(updated)
                setReviewing(null)
                if (accepted) toast.success('Cambio aceptado', { description: 'El trabajo pasó al nuevo horario.' })
                else toast.error('Cambio rechazado', { description: 'Se mantiene el horario actual.' })
            }}
        />}
    </div>
}
