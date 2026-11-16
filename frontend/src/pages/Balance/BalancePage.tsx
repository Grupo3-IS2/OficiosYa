import { useEffect, useMemo, useState } from 'react'
import avatarPlaceholder from '../../assets/avatar-placeholder.svg'
import BackNavigation from '../../components/BackNavigation/BackNavigation'
import Button from '../../components/Button/Button'
import Header from '../../components/Header/Header'
import Icon from '../../components/Icon/Icon'
import { useSession } from '../../components/SessionProvider/useSession'
import { getMyJobRequests } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import RequestDetailModal from '../Requests/RequestDetailModal'
import { serviceSummary } from '../Requests/requestList'
import { jobsBetween, monthlyBalance, workedAt } from './monthlyBalance'
import '../Requests/RequestsPage.css'
import './BalancePage.css'

const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' })
const monthFormatter = new Intl.DateTimeFormat('es-UY', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayFormatter = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'long', timeZone: 'America/Montevideo' })

/** "2026-11" → "noviembre de 2026" */
const monthName = (month: string) => monthFormatter.format(new Date(`${month}-01T00:00:00Z`))

/** One paid job, laid out like the cards in Mis solicitudes: the client, what was earned, and the transfer. */
function BalanceJobCard({ job, onView }: Readonly<{ job: JobRequest; onView: (job: JobRequest) => void }>) {
    const fee = job.platformFee ?? 0
    return <article className="request-card">
        <div className="request-card__professional">
            <img src={job.clientProfileImageUrl || avatarPlaceholder} alt={`Foto de ${job.clientName}`}
                onError={event => { event.currentTarget.src = avatarPlaceholder }} />
            <div className="request-card__copy">
                <h3>{serviceSummary(job)}</h3>
                <strong>{job.clientName}</strong>
                <p>{dayFormatter.format(new Date(workedAt(job)))}</p>
                <span><Icon name="location" /><span className="request-card__location" title={job.location}>{job.location}</span></span>
            </div>
        </div>
        <div className="request-card__amount">
            <span>Tu ganancia:</span>
            <strong>{amountFormatter.format(job.paymentAmount - fee)}</strong>
            <small className="balance-job__fee">{amountFormatter.format(job.paymentAmount)} − {amountFormatter.format(fee)} de comisión</small>
        </div>
        <div className={`request-card__status request-card__status--${job.payoutAt ? 'completed' : 'pending'}`}>
            <span className="request-card__status-dot" aria-hidden="true" />
            <strong>{job.payoutAt ? 'Transferido' : 'Pendiente de transferir'}</strong>
            <p>{job.payoutAt ? `El ${dayFormatter.format(new Date(job.payoutAt))}` : 'Te lo transferimos a la cuenta de tu perfil.'}</p>
        </div>
        <div className="request-card__action">
            <Button type="button" aria-label={`Ver solicitud de ${job.clientName}`}
                onClick={() => onView(job)}>Ver solicitud</Button>
        </div>
    </article>
}

/** What the professional earned each month from paid jobs, how much of it was already transferred, and the jobs. */
export default function BalancePage() {
    const { user } = useSession()
    const isProfessional = user?.role === 'PROFESSIONAL'
    const [jobs, setJobs] = useState<JobRequest[] | null>(null)
    const [error, setError] = useState('')
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [viewing, setViewing] = useState<JobRequest | null>(null)

    useEffect(() => {
        if (!isProfessional) return
        getMyJobRequests('COMPLETED')
            .then(setJobs)
            .catch(() => setError('No pudimos cargar tu balance.'))
    }, [isProfessional])

    const months = useMemo(() => jobs && user ? monthlyBalance(jobsBetween(jobs, from, to), user.id) : [], [jobs, user, from, to])

    return <div className="balance-page">
        <Header />
        <main className="balance-page__content">
            <BackNavigation href="/">Volver al inicio</BackNavigation>
            <h1>Mi balance</h1>
            {!isProfessional
                ? <p role="alert">Solo los profesionales tienen balance.</p>
                : <>
                    <p className="balance-page__intro">Lo que cobraste cada mes por trabajos terminados, ya descontada la comisión de OficiosYa, y cuánto te transferimos.</p>
                    <div className="balance-filters">
                        <label>Desde<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
                        <label>Hasta<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
                        {(from || to) && <Button type="button" variant="ghost" onClick={() => { setFrom(''); setTo('') }}>Limpiar</Button>}
                    </div>
                    {error && <p className="balance-page__error" role="alert">{error}</p>}
                    {jobs === null && !error && <p role="status">Cargando…</p>}
                    {jobs && months.length === 0 && <p role="status">{from || to ? 'No tenés trabajos cobrados entre esas fechas.' : 'Todavía no tenés trabajos cobrados.'}</p>}
                    <div className="request-groups">
                        {months.map(month => <section key={month.month} className="request-group" aria-labelledby={`balance-${month.month}`}>
                            <h2 id={`balance-${month.month}`}>{monthName(month.month)}</h2>
                            <dl className="balance-summary">
                                <div><dt>Trabajos</dt><dd>{month.jobs}</dd></div>
                                <div><dt>Pagado por clientes</dt><dd>{amountFormatter.format(month.gross)}</dd></div>
                                <div><dt>Comisión de OficiosYa</dt><dd>− {amountFormatter.format(month.fee)}</dd></div>
                                <div className="balance-summary__net"><dt>Tu ganancia</dt><dd>{amountFormatter.format(month.net)}</dd></div>
                                <div><dt>Ya transferido</dt><dd>{amountFormatter.format(month.transferred)}</dd></div>
                                <div className={month.pending > 0 ? 'balance-summary__pending' : ''}><dt>Pendiente</dt><dd>{amountFormatter.format(month.pending)}</dd></div>
                            </dl>
                            <div className="request-group__items">
                                {month.items.map(job => <BalanceJobCard key={job.id} job={job} onView={setViewing} />)}
                            </div>
                        </section>)}
                    </div>
                </>}
        </main>
        {/* Over the balance, like in Mis solicitudes: a completed job has nothing left to reschedule or answer */}
        {viewing && <RequestDetailModal
            key={viewing.id}
            request={viewing}
            isClient={false}
            pin={null}
            onClose={() => setViewing(null)}
            onAnswered={updated => {
                setJobs(current => current?.map(job => job.id === updated.id ? updated : job) ?? null)
                setViewing(updated)
            }}
            onReviewReschedule={() => {}}
            onReschedule={() => {}}
        />}
    </div>
}
