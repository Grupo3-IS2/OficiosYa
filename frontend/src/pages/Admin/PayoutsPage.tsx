import { useEffect, useMemo, useState } from 'react'
import BackNavigation from '../../components/BackNavigation/BackNavigation'
import Button from '../../components/Button/Button'
import Header from '../../components/Header/Header'
import { useSession } from '../../components/SessionProvider/useSession'
import { getPayoutHistory, getPendingPayouts, getRefundHistory, markPaidOut } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import AllTransfers from './AllTransfers'
import { byNewest, filterPayouts, payoutProfessionals, professionalShare, transferDate } from './payoutFilter'
import PendingRefunds from './PendingRefunds'
import './PayoutsPage.css'

const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' })
const dateFormatter = new Intl.DateTimeFormat('es-UY', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Montevideo',
})

type View = 'all' | 'pending' | 'refunds' | 'history'

const isRefund = (job: JobRequest) => job.paymentState === 'REFUNDED'

/**
 * Paid jobs whose professional still has to be transferred their share, and the transfers already made. The admin
 * makes each transfer outside OficiosYa (bank or Mercado Pago) and then marks it here.
 */
export default function PayoutsPage() {
    const { user } = useSession()
    const isAdmin = user?.role === 'ADMIN'
    const [view, setView] = useState<View>('all')
    const [payouts, setPayouts] = useState<JobRequest[] | null>(null)
    const [error, setError] = useState('')
    const [marking, setMarking] = useState<number | null>(null)
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [professionalId, setProfessionalId] = useState('')

    useEffect(() => {
        if (!isAdmin || view === 'all' || view === 'refunds') return
        let active = true
        ;(view === 'pending' ? getPendingPayouts()
            : Promise.all([getPayoutHistory(), getRefundHistory()]).then(([transfers, refunds]) => byNewest([...transfers, ...refunds])))
            .then(list => { if (active) setPayouts(list) })
            .catch(() => { if (active) setError(view === 'pending' ? 'No pudimos cargar las transferencias pendientes.' : 'No pudimos cargar el historial.') })
        return () => { active = false }
    }, [isAdmin, view])

    async function markTransferred(job: JobRequest) {
        setMarking(job.id)
        setError('')
        try {
            await markPaidOut(job.id)
            setPayouts(current => current?.filter(item => item.id !== job.id) ?? null)
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No pudimos marcar la transferencia.')
        } finally {
            setMarking(null)
        }
    }

    const shown = useMemo(() => payouts && view === 'history' ? filterPayouts(payouts, from, to, professionalId) : payouts,
        [payouts, view, from, to, professionalId])
    const professionals = useMemo(() => payoutProfessionals(payouts ?? []), [payouts])
    const total = shown?.filter(job => !isRefund(job)).reduce((sum, job) => sum + Math.round(professionalShare(job) * 100), 0) ?? 0

    return <div className="payouts-page">
        <Header />
        <main className="payouts-page__content">
            <BackNavigation href="/">Volver al inicio</BackNavigation>
            <h1>Transferencias</h1>
            {!isAdmin
                ? <p role="alert">Solo un administrador puede ver esta página.</p>
                : <>
                    <div className="payouts-tabs" role="group" aria-label="Qué transferencias ver">
                        {([['all', 'Todas'], ['pending', 'Pendientes'], ['refunds', 'Devoluciones'], ['history', 'Historial']] as const).map(([value, label]) => <button
                            key={value} type="button" className={view === value ? 'is-active' : ''} aria-pressed={view === value}
                            onClick={() => { if (view === value) return; setView(value); setPayouts(null); setError('') }}>{label}</button>)}
                    </div>
                    {view === 'all' ? <AllTransfers /> : view === 'refunds' ? <PendingRefunds /> : <>
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
                    {payouts?.length === 0 && <p role="status">{view === 'pending' ? 'No hay transferencias pendientes.' : 'Todavía no se hizo ninguna transferencia.'}</p>}
                    {payouts && payouts.length > 0 && shown?.length === 0 && <p role="status">No hay transferencias con esos filtros.</p>}
                    {shown && shown.length > 0 && <>
                        <p className="payouts-total">{view === 'pending' ? 'Total a transferir' : 'Total transferido'}: <strong>{amountFormatter.format(total / 100)}</strong></p>
                        <table className="payouts-table">
                            <thead>
                                <tr>
                                    {view === 'history' && <th scope="col">Fecha</th>}
                                    {view === 'history' && <th scope="col">Tipo</th>}
                                    <th scope="col">Solicitud</th>
                                    <th scope="col">{view === 'history' ? 'Para' : 'Profesional'}</th>
                                    <th scope="col">{view === 'history' ? 'Cuenta u operación' : 'Cuenta para cobrar'}</th>
                                    <th scope="col">{view === 'pending' ? 'A transferir' : 'Monto'}</th>
                                    <th scope="col">Comisión</th>
                                    {view === 'pending' && <th scope="col"><span className="payouts-sr-only">Acción</span></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map(job => <tr key={job.id}>
                                    {view === 'history' && <td>{dateFormatter.format(new Date(transferDate(job) ?? ''))}</td>}
                                    {view === 'history' && <td>{isRefund(job) ? 'Devolución' : 'Transferencia'}</td>}
                                    <td>#{job.id}</td>
                                    <td>{isRefund(job) ? job.clientName : job.professionalName}</td>
                                    <td>{isRefund(job) ? job.mpPaymentId : job.professionalPayoutAccount || <em>Sin cuenta: pedísela por chat</em>}</td>
                                    <td><strong>{amountFormatter.format(isRefund(job) ? job.paymentAmount : professionalShare(job))}</strong></td>
                                    <td>{isRefund(job) ? '—' : amountFormatter.format(job.platformFee ?? 0)}</td>
                                    {view === 'pending' && <td>
                                        <Button type="button" disabled={marking !== null} onClick={() => void markTransferred(job)}>
                                            {marking === job.id ? 'Guardando…' : 'Marcar transferido'}
                                        </Button>
                                    </td>}
                                </tr>)}
                            </tbody>
                        </table>
                    </>}
                    </>}
                </>}
        </main>
    </div>
}
