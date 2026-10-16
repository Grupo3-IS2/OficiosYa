import { useEffect, useMemo, useState } from 'react'
import { publishAwaitingAnswers } from '../../components/Header/useAwaitingAnswers'
import { toast } from 'sonner'
import BackNavigation from '../../components/BackNavigation/BackNavigation'
import Button from '../../components/Button/Button'
import Header from '../../components/Header/Header'
import Icon from '../../components/Icon/Icon'
import avatarPlaceholder from '../../assets/avatar-placeholder.svg'
import { getCurrentUser } from '../../services/authService'
import { getMyJobRequests } from '../../services/jobRequestService'
import { getJobRequestPin } from '../../services/jobRequestPinStore'
import type { JobRequest, JobStatus, RequestParty } from '../../types/JobRequest'
import { answersReschedule, awaitsAnswerFrom, filterAndOrderRequests, filterByDirection, groupRequestsByDate, localDateKey, requestDescription, serviceSummary, type RequestDirection, type RequestFilter, type RequestOrder } from './requestList'
import RequestOrderControl from './RequestOrderControl'
import RequestDetailModal from './RequestDetailModal'
import RescheduleModal from './RescheduleModal'
import RescheduleReviewModal from './RescheduleReviewModal'
import type { ResponseMode } from './RequestResponseSection'
import type { Decision, RequestOutcome } from './requestResponse'
import { timeframeText } from './rescheduleTimeframe'
import './RequestsPage.css'

const filters: { value: RequestFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'awaiting', label: 'Por responder' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'accepted', label: 'Aceptadas' },
    { value: 'completed', label: 'Completadas' },
    { value: 'cancelled', label: 'Canceladas' },
]

const directions: { value: RequestDirection; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'received', label: 'Recibidas' },
    { value: 'sent', label: 'Enviadas' },
]

const emptyDirection: Record<Exclude<RequestDirection, 'all'>, { title: string; text: string }> = {
    received: { title: 'Todavía no recibiste solicitudes', text: 'Cuando un cliente te pida un trabajo, vas a verlo acá.' },
    sent: { title: 'Todavía no hiciste solicitudes', text: 'Cuando le pidas un servicio a otro profesional, vas a poder seguirlo desde acá.' },
}

/** Which side of the request the viewer is on: /job-requests/mine returns both. */
type Side = 'client' | 'professional'

function partyOf(side: Side): RequestParty {
    return side === 'professional' ? 'PROFESSIONAL' : 'CLIENT'
}

function otherNameOf(request: JobRequest, side: Side): string {
    return side === 'professional' ? request.clientName : request.professionalName
}

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
            const other = otherNameOf(request, side)
            if (answersReschedule(request, partyOf(side))) {
                return proposed ? `${other} propone ${proposed}.` : `${other} pidió cambiar el horario.`
            }
            return proposed
                ? `Propusiste ${proposed}. Esperando a ${other}.`
                : `Esperando que ${other} responda.`
        },
    },
    COMPLETED: { label: 'Completada', tone: 'completed' },
    CANCELLED: { label: 'Cancelada', tone: 'cancelled' },
    REJECTED: { label: 'Rechazada', tone: 'cancelled' },
}

const dateFormatter = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Montevideo' })
const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 })

function plural(count: number, one: string, many: string): string {
    return count === 1 ? one : many
}

/** What the alert adds after the count, by what the viewer has to answer. */
function awaitingDetail(proposals: number, changes: number): string {
    if (proposals > 0 && changes > 0) {
        return `${proposals} ${plural(proposals, 'pedido de trabajo', 'pedidos de trabajo')} y ${changes} ${plural(changes, 'cambio de horario', 'cambios de horario')} para aceptar o rechazar.`
    }
    if (proposals > 0) return plural(proposals, 'El cliente no sabe si vas a tomar el trabajo.', 'Los clientes no saben si vas a tomar el trabajo.')
    return plural(changes, 'Te pidieron un cambio de horario: aceptalo o rechazalo.', `Te pidieron ${changes} cambios de horario: aceptalos o rechazalos.`)
}

/** Accepting and rejecting are always the professional's; cancelling can be either side's. */
const answeredToast: Record<RequestOutcome, (request: JobRequest, isClient: boolean) => void> = {
    accepted: request => toast.success('Solicitud aceptada', { description: `Le avisamos a ${request.clientName}. El horario quedó en tu agenda.` }),
    rejected: request => toast.error('Solicitud rechazada', { description: `${request.clientName} va a ver que la rechazaste.` }),
    cancelled: (request, isClient) => toast('Solicitud cancelada', {
        description: `${isClient ? request.professionalName : request.clientName} va a ver que la cancelaste.`,
    }),
}

function groupHeading(dateKey: string): string {
    const formatted = dateFormatter.format(new Date(`${dateKey}T12:00:00-03:00`))
    return dateKey === localDateKey(new Date().toISOString()) ? `Hoy · ${formatted}` : formatted
}

/** "Rechazar" and "Aceptar" side by side, for whatever is waiting on the viewer. */
function DecisionButtons({ subject, onDecide }: Readonly<{
    /** What is being answered, for screen readers: "solicitud de Carla", "cambio de horario que pidió Carla". */
    subject: string
    onDecide: (decision: Decision) => void
}>) {
    return <div className="request-card__decision">
        <Button type="button" variant="ghost" className="request-card__reject" aria-label={`Rechazar ${subject}`}
            onClick={() => onDecide('reject')}>Rechazar</Button>
        <Button type="button" aria-label={`Aceptar ${subject}`} onClick={() => onDecide('accept')}>Aceptar</Button>
    </div>
}

function RequestCard({ request, side, onView, onRespond, onReschedule, onReviewReschedule }: Readonly<{
    request: JobRequest
    side: Side
    onView: (request: JobRequest) => void
    /** Accepting a request needs the timeframe and rejecting it takes a reason: both go on in the detail. */
    onRespond: (request: JobRequest, mode: ResponseMode) => void
    onReschedule: (request: JobRequest) => void
    onReviewReschedule: (request: JobRequest, decision: Decision) => void
}>) {
    const status = statusContent[request.status]
    const detail = status.detail?.(request, side)
    // Both wait on the viewer, and look the same: a request made to them, and a change of timeframe
    const proposalToAnswer = side === 'professional' && request.status === 'PROPOSED'
    const answersChange = answersReschedule(request, partyOf(side))
    const urgent = proposalToAnswer || answersChange
    // The other side of the job: who the viewer is dealing with.
    const otherName = side === 'professional' ? request.clientName : request.professionalName
    const otherImage = side === 'professional' ? request.clientProfileImageUrl : request.professionalProfileImageUrl

    return <article className={`request-card${urgent ? ' request-card--needs-answer' : ''}`}>
        <div className="request-card__professional">
            <img
                src={otherImage || avatarPlaceholder}
                alt={`Foto de ${otherName}`}
                onError={event => { event.currentTarget.src = avatarPlaceholder }}
            />
            <div className="request-card__copy">
                {urgent && <span className="request-card__badge">Requiere tu respuesta</span>}
                <h3>{serviceSummary(request)}</h3>
                <strong>{otherName}</strong>
                <p>{requestDescription(request)}</p>
                <span><Icon name="location" /><span className="request-card__location" title={request.location}>{request.location}</span></span>
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
            <Button type="button" variant={urgent ? 'ghost' : 'primary'} aria-label={`Ver solicitud de ${otherName}`}
                onClick={() => onView(request)}>Ver solicitud</Button>
            {proposalToAnswer && <DecisionButtons subject={`solicitud de ${otherName}`}
                onDecide={decision => onRespond(request, decision === 'accept' ? 'accepting' : 'rejecting')} />}
            {answersChange && <DecisionButtons subject={`cambio de horario que pidió ${otherName}`}
                onDecide={decision => onReviewReschedule(request, decision)} />}
            {/* Only an accepted job has a timeframe to move, and either side can ask */}
            {request.status === 'ACCEPTED' && <Button type="button" variant="ghost" aria-label={`Reagendar solicitud de ${otherName}`}
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
    const [viewing, setViewing] = useState<JobRequest | null>(null)
    // Which answer form the detail opens with, when it comes from the card's "Aceptar" or "Rechazar"
    const [viewingResponse, setViewingResponse] = useState<ResponseMode | undefined>()
    const [rescheduling, setRescheduling] = useState<JobRequest | null>(null)
    const [reviewing, setReviewing] = useState<{ request: JobRequest; decision: Decision } | null>(null)
    const view = (request: JobRequest, response?: ResponseMode) => {
        setViewingResponse(response)
        setViewing(request)
    }
    const review = (request: JobRequest, decision: Decision) => setReviewing({ request, decision })
    const viewer = getCurrentUser()
    const viewerId = viewer?.id
    // Only a professional has both sides; a client's requests are all sent by them
    const isProfessional = viewer?.role === 'PROFESSIONAL'
    const [chosenDirection, setDirection] = useState<RequestDirection>('all')
    const direction = isProfessional ? chosenDirection : 'all'
    const replaceRequest = (updated: JobRequest) =>
        setRequests(previous => previous.map(item => item.id === updated.id ? { ...item, ...updated } : item))
    const awaiting = requests.filter(request => awaitsAnswerFrom(request, viewerId))
    const awaitingProposals = awaiting.filter(request => request.status === 'PROPOSED').length
    const visible = useMemo(() => filterByDirection(requests, direction, viewerId), [requests, direction, viewerId])
    const groups = useMemo(() => groupRequestsByDate(filterAndOrderRequests(visible, activeFilter, order, viewerId)), [visible, activeFilter, order, viewerId])
    const showingAwaiting = activeFilter === 'awaiting' && direction === 'all'
    // "Por responder" only shows while there is something to answer (or it is the filter in use)
    const shownFilters = filters.filter(filter => filter.value !== 'awaiting' || awaiting.length > 0 || activeFilter === 'awaiting')

    // The header's "Mis solicitudes" alert follows what waits here, as it is answered
    useEffect(() => {
        if (!loading && !loadError) publishAwaitingAnswers(awaiting.length)
    }, [loading, loadError, awaiting.length])

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
                {isProfessional && <div className="requests-direction" role="group" aria-label="Qué solicitudes ver">
                    {directions.map(option => <button
                        key={option.value}
                        type="button"
                        className={direction === option.value ? 'is-active' : ''}
                        aria-pressed={direction === option.value}
                        onClick={() => setDirection(option.value)}
                    >
                        {option.label}
                        {!loading && <span className="requests-direction__count">{filterByDirection(requests, option.value, viewerId).length}</span>}
                    </button>)}
                </div>}
            </div>
            {isProfessional && direction !== 'all' && <p className="requests-direction__hint">
                {direction === 'received'
                    ? 'Trabajos que los clientes te pidieron a vos como profesional.'
                    : 'Servicios que vos le pediste a otros profesionales.'}
            </p>}
            <div className="requests-toolbar">
                <div className="requests-filters" aria-label="Filtrar solicitudes">
                    {shownFilters.map(filter => <button
                        key={filter.value}
                        type="button"
                        className={activeFilter === filter.value ? 'is-active' : ''}
                        aria-pressed={activeFilter === filter.value}
                        onClick={() => setActiveFilter(filter.value)}
                    >{filter.label}</button>)}
                </div>
                <RequestOrderControl value={order} onChange={setOrder} />
            </div>

            {awaiting.length > 0 && <div className="requests-alert" role="status">
                <span className="requests-alert__count" aria-hidden="true">{awaiting.length}</span>
                <p>
                    <strong>Tienes {awaiting.length} {plural(awaiting.length, 'solicitud', 'solicitudes')} esperando tu respuesta.</strong>
                    {' '}{awaitingDetail(awaitingProposals, awaiting.length - awaitingProposals)}
                </p>
                {!showingAwaiting && <Button type="button" onClick={() => {
                    setDirection('all')
                    setActiveFilter('awaiting')
                }}>Ver por responder</Button>}
            </div>}

            <section className="request-groups" aria-live="polite">
                {loading
                    ? <output className="requests-feedback">Cargando solicitudes...</output>
                    : loadError
                        ? <div className="requests-feedback" role="alert"><h2>No pudimos cargar tus solicitudes</h2><p>Revisá tu conexión e intentá nuevamente.</p></div>
                        : requests.length === 0
                            ? <div className="requests-empty"><h2>Todavía no tienes solicitudes</h2><p>Cuando solicites un servicio, vas a poder seguirlo desde acá.</p></div>
                            : visible.length === 0 && direction !== 'all'
                                ? <div className="requests-empty"><h2>{emptyDirection[direction].title}</h2><p>{emptyDirection[direction].text}</p></div>
                            : groups.length === 0
                    ? <div className="requests-empty"><h2>No hay solicitudes en este estado</h2><p>Probá con otro filtro para ver el resto de tus solicitudes.</p></div>
                    : groups.map(group => <section className="request-group" key={group.dateKey}>
                        <h2>{groupHeading(group.dateKey)}</h2>
                        <div className="request-group__items">
                            {group.requests.map(request => <RequestCard key={request.id} request={request}
                                side={request.professionalId === viewerId ? 'professional' : 'client'}
                                onView={request => view(request)} onRespond={view}
                                onReschedule={setRescheduling} onReviewReschedule={review} />)}
                        </div>
                    </section>)}
            </section>
        </main>
        {viewing && <RequestDetailModal
            request={viewing}
            isClient={viewing.clientId === viewerId}
            pin={viewing.clientId === viewerId && viewerId ? getJobRequestPin(viewerId, viewing.id) : null}
            initialResponse={viewingResponse}
            onClose={() => setViewing(null)}
            onReviewReschedule={review}
            onReschedule={setRescheduling}
            onAnswered={(updated, outcome) => {
                replaceRequest(updated)
                // Stays open on the updated request: the new status, timeframe or reason is right there
                setViewing(previous => previous && { ...previous, ...updated })
                answeredToast[outcome](updated, updated.clientId === viewerId)
            }}
        />}
        {rescheduling && <RescheduleModal
            request={rescheduling}
            onClose={() => setRescheduling(null)}
            onRescheduled={updated => {
                replaceRequest(updated)
                // Asked from the detail: it stays open behind, now showing the change waiting for an answer
                setViewing(previous => previous?.id === updated.id ? { ...previous, ...updated } : previous)
                setRescheduling(null)
            }}
        />}
        {reviewing && <RescheduleReviewModal
            request={reviewing.request}
            decision={reviewing.decision}
            onClose={() => setReviewing(null)}
            onAnswered={(updated, accepted) => {
                replaceRequest(updated)
                // Answered from the detail: it stays open behind, now with the agreed timeframe
                setViewing(previous => previous?.id === updated.id ? { ...previous, ...updated } : previous)
                setReviewing(null)
                if (accepted) toast.success('Cambio aceptado', { description: 'El trabajo pasó al nuevo horario.' })
                else toast.error('Cambio rechazado', { description: 'Se mantiene el horario actual.' })
            }}
        />}
    </div>
}
