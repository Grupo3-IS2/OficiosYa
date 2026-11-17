import { useEffect, useMemo, useState } from 'react'
import BackNavigation from '../../components/BackNavigation/BackNavigation'
import Button from '../../components/Button/Button'
import Header from '../../components/Header/Header'
import { useSession } from '../../components/SessionProvider/useSession'
import { getPayoutHistory, getPendingPayouts, getRetainedPayments, markPaidOut, refundRetained } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import { filterPayouts, payoutProfessionals } from './payoutFilter'
import './PayoutsPage.css'

const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' })
const dateFormatter = new Intl.DateTimeFormat('es-UY', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Montevideo',
})

type View = 'pending' | 'retained' | 'history'

const views: Record<View, { label: string; load: () => Promise<JobRequest[]>; loadError: string; intro: string; empty: string; total: string; amount: string }> = {
    pending: {
        label: 'Pendientes', load: getPendingPayouts, loadError: 'No pudimos cargar las transferencias pendientes.',
        intro: 'Trabajos completados cuyo profesional todavía no recibió su parte. Hacé la transferencia y después marcala acá.',
        empty: 'No hay transferencias pendientes.', total: 'Total a transferir', amount: 'A transferir',
    },
    retained: {
        label: 'Retenidos', load: getRetainedPayments, loadError: 'No pudimos cargar los pagos retenidos.',
        intro: 'Pagos que OficiosYa guarda hasta que el cliente dé el PIN. Reembolsar devuelve todo al cliente y cancela el trabajo.',
        empty: 'No hay pagos retenidos.', total: 'Total retenido', amount: 'Retenido',
    },
    history: {
        label: 'Historial', load: getPayoutHistory, loadError: 'No pudimos cargar el historial.',
        intro: 'Transferencias ya hechas a profesionales, de la más reciente a la más antigua.',
        empty: 'Todavía no se hizo ninguna transferencia.', total: 'Total transferido', amount: 'Transferido',
    },
}

const professionalShare = (job: JobRequest) => job.paymentAmount - (job.platformFee ?? 0)

/**
 * Paid jobs whose professional still has to be transferred their share, the payments held until the PIN, and the
 * transfers already made. The admin makes each transfer outside OficiosYa (bank or Mercado Pago) and then marks it here.
 */
export default function PayoutsPage() {
    const { user } = useSession()
    const isAdmin = user?.role === 'ADMIN'
    const [view, setView] = useState<View>('pending')
    const [payouts, setPayouts] = useState<JobRequest[] | null>(null)
    const [error, setError] = useState('')
    const [marking, setMarking] = useState<number | null>(null)
    const [confirmingRefund, setConfirmingRefund] = useState<number | null>(null)
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [professionalId, setProfessionalId] = useState('')

    useEffect(() => {
        if (!isAdmin) return
        let active = true
        views[view].load()
            .then(list => { if (active) setPayouts(list) })
            .catch(() => { if (active) setError(views[view].loadError) })
        return () => { active = false }
    }, [isAdmin, view])

    async function settle(job: JobRequest, action: (id: number) => Promise<JobRequest>, failed: string) {
        setMarking(job.id)
        setError('')
        try {
            await action(job.id)
            setPayouts(current => current?.filter(item => item.id !== job.id) ?? null)
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : failed)
        } finally {
            setMarking(null)
            setConfirmingRefund(null)
        }
    }

    const shown = useMemo(() => payouts && view === 'history' ? filterPayouts(payouts, from, to, professionalId) : payouts,
        [payouts, view, from, to, professionalId])
    const professionals = useMemo(() => payoutProfessionals(payouts ?? []), [payouts])
    const total = shown?.reduce((sum, job) => sum + Math.round(professionalShare(job) * 100), 0) ?? 0

    return <div className="payouts-page">
        <Header />
        <main className="payouts-page__content">
            <BackNavigation href="/">Volver al inicio</BackNavigation>
            <h1>Transferencias</h1>
            {!isAdmin
                ? <p role="alert">Solo un administrador puede ver esta página.</p>
                : <>
                    <div className="payouts-tabs" role="group" aria-label="Qué transferencias ver">
                        {(Object.keys(views) as View[]).map(value => <button
                            key={value} type="button" className={view === value ? 'is-active' : ''} aria-pressed={view === value}
                            onClick={() => { if (view === value) return; setView(value); setPayouts(null); setError(''); setConfirmingRefund(null) }}>{views[value].label}</button>)}
                    </div>
                    <p className="payouts-page__intro">{views[view].intro}</p>
                    {view === 'history' && <div className="payouts-filters">
                        <label>Desde<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
                        <label>Hasta<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
                        <label>Profesional<select value={professionalId} onChange={event => setProfessionalId(event.target.value)}>
                            <option value="">Todos</option>
                            {professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
                        </select></label>
                        {(from || to || professionalId) && <Button type="button" variant="ghost" onClick={() => { setFrom(''); setTo(''); setProfessionalId('') }}>Limpiar</Button>}
                    </div>}
                    {error && <p className="payouts-page__error" role="alert">{error}</p>}
                    {payouts === null && !error && <p role="status">Cargando…</p>}
                    {payouts?.length === 0 && <p role="status">{views[view].empty}</p>}
                    {payouts && payouts.length > 0 && shown?.length === 0 && <p role="status">No hay transferencias con esos filtros.</p>}
                    {shown && shown.length > 0 && <>
                        <p className="payouts-total">{views[view].total}: <strong>{amountFormatter.format(total / 100)}</strong></p>
                        <table className="payouts-table">
                            <thead>
                                <tr>
                                    {view === 'history' && <th scope="col">Fecha</th>}
                                    <th scope="col">Solicitud</th>
                                    <th scope="col">Profesional</th>
                                    {view !== 'retained' && <th scope="col">Cuenta para cobrar</th>}
                                    <th scope="col">{views[view].amount}</th>
                                    {view !== 'retained' && <th scope="col">Comisión</th>}
                                    {view !== 'history' && <th scope="col"><span className="payouts-sr-only">Acción</span></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map(job => <tr key={job.id}>
                                    {view === 'history' && <td>{job.payoutAt ? dateFormatter.format(new Date(job.payoutAt)) : ''}</td>}
                                    <td>#{job.id}</td>
                                    <td>{job.professionalName}</td>
                                    {view !== 'retained' && <td>
                                        {job.professionalPayoutAccount || <em>Sin cuenta: pedísela por chat</em>}
                                        {job.professionalPayoutVerified && <small> · Vinculada</small>}
                                    </td>}
                                    <td><strong>{amountFormatter.format(professionalShare(job))}</strong></td>
                                    {view !== 'retained' && <td>{amountFormatter.format(job.platformFee ?? 0)}</td>}
                                    {view === 'pending' && <td>
                                        <Button type="button" disabled={marking !== null} onClick={() => void settle(job, markPaidOut, 'No pudimos marcar la transferencia.')}>
                                            {marking === job.id ? 'Guardando…' : 'Marcar transferido'}
                                        </Button>
                                    </td>}
                                    {view === 'retained' && <td>
                                        {confirmingRefund === job.id
                                            ? <Button type="button" disabled={marking !== null} onClick={() => void settle(job, refundRetained, 'No pudimos hacer el reembolso.')}>
                                                {marking === job.id ? 'Reembolsando…' : 'Confirmar reembolso'}
                                            </Button>
                                            : <Button type="button" variant="ghost" disabled={marking !== null} onClick={() => setConfirmingRefund(job.id)}>Reembolsar</Button>}
                                    </td>}
                                </tr>)}
                            </tbody>
                        </table>
                    </>}
                </>}
        </main>
    </div>
}
