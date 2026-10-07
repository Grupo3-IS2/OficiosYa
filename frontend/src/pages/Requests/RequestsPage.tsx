import { useEffect, useMemo, useState } from 'react'
import BackNavigation from '../../components/BackNavigation/BackNavigation'
import Button from '../../components/Button/Button'
import Header from '../../components/Header/Header'
import Icon from '../../components/Icon/Icon'
import avatarPlaceholder from '../../assets/avatar-placeholder.svg'
import { getMyJobRequests } from '../../services/jobRequestService'
import type { JobRequest, JobStatus } from '../../types/JobRequest'
import { filterAndOrderRequests, groupRequestsByDate, localDateKey, requestDescription, serviceSummary, type RequestFilter, type RequestOrder } from './requestList'
import RequestOrderControl from './RequestOrderControl'
import './RequestsPage.css'

const filters: { value: RequestFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'accepted', label: 'Aceptadas' },
    { value: 'completed', label: 'Completadas' },
    { value: 'cancelled', label: 'Canceladas' },
]

const statusContent: Record<JobStatus, { label: string; tone: string; detail?: (request: JobRequest) => string }> = {
    PROPOSED: {
        label: 'Pendiente de respuesta',
        tone: 'pending',
        detail: request => `Esperando que ${request.professionalName} revise tu solicitud.`,
    },
    ACCEPTED: { label: 'Aceptada', tone: 'accepted' },
    COMPLETED: { label: 'Completada', tone: 'completed' },
    CANCELLED: { label: 'Cancelada', tone: 'cancelled' },
    REJECTED: { label: 'Rechazada', tone: 'cancelled' },
}

const dateFormatter = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Montevideo' })
const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 })

function groupHeading(dateKey: string): string {
    const formatted = dateFormatter.format(new Date(`${dateKey}T12:00:00-03:00`))
    return dateKey === localDateKey(new Date().toISOString()) ? `Hoy · ${formatted}` : formatted
}

function RequestCard({ request }: { request: JobRequest }) {
    const status = statusContent[request.status]

    return <article className="request-card">
        <div className="request-card__professional">
            <img
                src={request.professionalProfileImageUrl || avatarPlaceholder}
                alt={`Foto de ${request.professionalName}`}
                onError={event => { event.currentTarget.src = avatarPlaceholder }}
            />
            <div className="request-card__copy">
                <h3>{serviceSummary(request)}</h3>
                <strong>{request.professionalName}</strong>
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
            {status.detail && <p>{status.detail(request)}</p>}
        </div>
        <div className="request-card__action">
            <Button type="button" aria-label={`Ver solicitud de ${request.professionalName}`}>Ver solicitud</Button>
        </div>
    </article>
}

export default function RequestsPage() {
    const [requests, setRequests] = useState<JobRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [activeFilter, setActiveFilter] = useState<RequestFilter>('all')
    const [order, setOrder] = useState<RequestOrder>('newest')
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
                            {group.requests.map(request => <RequestCard key={request.id} request={request} />)}
                        </div>
                    </section>)}
            </section>
        </main>
    </div>
}
