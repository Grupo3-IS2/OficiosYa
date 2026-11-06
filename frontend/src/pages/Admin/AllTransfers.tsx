import { useCallback, useEffect, useState } from 'react'
import Button from '../../components/Button/Button'
import { getPayoutHistory, getPendingPayouts, getPendingRefunds, getRefundHistory, markPaidOut, markRefunded } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import { byNewest, professionalShare } from './payoutFilter'

const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' })

type Kind = 'payout' | 'refund' | 'done' | 'refunded'
interface Transfer { kind: Kind; job: JobRequest }

const kindLabels: Record<Kind, string> = {
    payout: 'Transferencia pendiente',
    refund: 'Devolución pendiente',
    done: 'Transferida',
    refunded: 'Devuelta',
}

/** Everything at once, what still has to be done first: transfers and refunds to make, then the ones made. */
export default function AllTransfers() {
    const [transfers, setTransfers] = useState<Transfer[] | null>(null)
    const [error, setError] = useState('')
    const [marking, setMarking] = useState<string | null>(null)

    const load = useCallback(async () => {
        const [payouts, refunds, transferred, refunded] = await Promise.all([getPendingPayouts(), getPendingRefunds(), getPayoutHistory(), getRefundHistory()])
        return [
            ...payouts.map(job => ({ kind: 'payout' as const, job })),
            ...refunds.map(job => ({ kind: 'refund' as const, job })),
            ...byNewest([...transferred, ...refunded]).map(job => ({ kind: job.paymentState === 'REFUNDED' ? 'refunded' as const : 'done' as const, job })),
        ]
    }, [])

    useEffect(() => {
        let active = true
        load()
            .then(list => { if (active) setTransfers(list) })
            .catch(() => { if (active) setError('No pudimos cargar las transferencias.') })
        return () => { active = false }
    }, [load])

    async function mark({ kind, job }: Transfer) {
        if (kind === 'refund' && !window.confirm(`¿Ya le devolviste ${amountFormatter.format(job.paymentAmount)} a ${job.clientName} desde Mercado Pago?`)) return
        setMarking(`${kind}-${job.id}`)
        setError('')
        try {
            await (kind === 'refund' ? markRefunded(job.id) : markPaidOut(job.id))
            setTransfers(await load())
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No pudimos guardar el cambio.')
        } finally {
            setMarking(null)
        }
    }

    return <>
        {error && <p className="payouts-page__error" role="alert">{error}</p>}
        {transfers === null && !error && <p role="status">Cargando…</p>}
        {transfers?.length === 0 && <p role="status">Todavía no hay transferencias.</p>}
        {transfers && transfers.length > 0 && <table className="payouts-table">
            <thead>
                <tr>
                    <th scope="col">Tipo</th>
                    <th scope="col">Solicitud</th>
                    <th scope="col">Para</th>
                    <th scope="col">Cuenta u operación</th>
                    <th scope="col">Monto</th>
                    <th scope="col"><span className="payouts-sr-only">Acción</span></th>
                </tr>
            </thead>
            <tbody>
                {transfers.map(transfer => {
                    const { kind, job } = transfer
                    const key = `${kind}-${job.id}`
                    const toClient = kind === 'refund' || kind === 'refunded'
                    return <tr key={key}>
                        <td>{kindLabels[kind]}</td>
                        <td>#{job.id}</td>
                        <td>{toClient ? job.clientName : job.professionalName}</td>
                        <td>{toClient ? job.mpPaymentId : job.professionalPayoutAccount || <em>Sin cuenta: pedísela por chat</em>}</td>
                        <td><strong>{amountFormatter.format(toClient ? job.paymentAmount : professionalShare(job))}</strong></td>
                        <td>{(kind === 'payout' || kind === 'refund') && <Button type="button" disabled={marking !== null} onClick={() => void mark(transfer)}>
                            {marking === key ? 'Guardando…' : kind === 'refund' ? 'Marcar devuelto' : 'Marcar transferido'}
                        </Button>}</td>
                    </tr>
                })}
            </tbody>
        </table>}
    </>
}
