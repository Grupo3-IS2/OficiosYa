import { useEffect, useState } from 'react'
import Button from '../../components/Button/Button'
import { getPendingRefunds, markRefunded } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'

const amountFormatter = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' })

/** Cancelled jobs whose money is still held: the admin gives it back from Mercado Pago and then marks it here. */
export default function PendingRefunds() {
    const [refunds, setRefunds] = useState<JobRequest[] | null>(null)
    const [error, setError] = useState('')
    const [marking, setMarking] = useState<number | null>(null)

    useEffect(() => {
        let active = true
        getPendingRefunds()
            .then(list => { if (active) setRefunds(list) })
            .catch(() => { if (active) setError('No pudimos cargar las devoluciones pendientes.') })
        return () => { active = false }
    }, [])

    async function markGivenBack(job: JobRequest) {
        if (!window.confirm(`¿Ya le devolviste ${amountFormatter.format(job.paymentAmount)} a ${job.clientName} desde Mercado Pago?`)) return
        setMarking(job.id)
        setError('')
        try {
            await markRefunded(job.id)
            setRefunds(current => current?.filter(item => item.id !== job.id) ?? null)
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No pudimos marcar la devolución.')
        } finally {
            setMarking(null)
        }
    }

    const total = refunds?.reduce((sum, job) => sum + Math.round(job.paymentAmount * 100), 0) ?? 0

    return <>
        {error && <p className="payouts-page__error" role="alert">{error}</p>}
        {refunds === null && !error && <p role="status">Cargando…</p>}
        {refunds?.length === 0 && <p role="status">No hay devoluciones pendientes.</p>}
        {refunds && refunds.length > 0 && <>
            <p className="payouts-total">Total a devolver: <strong>{amountFormatter.format(total / 100)}</strong></p>
            <table className="payouts-table">
                <thead>
                    <tr>
                        <th scope="col">Solicitud</th>
                        <th scope="col">Cliente</th>
                        <th scope="col">Operación de Mercado Pago</th>
                        <th scope="col">A devolver</th>
                        <th scope="col"><span className="payouts-sr-only">Acción</span></th>
                    </tr>
                </thead>
                <tbody>
                    {refunds.map(job => <tr key={job.id}>
                        <td>#{job.id}</td>
                        <td>{job.clientName}</td>
                        <td>{job.mpPaymentId}</td>
                        <td><strong>{amountFormatter.format(job.paymentAmount)}</strong></td>
                        <td>
                            <Button type="button" disabled={marking !== null} onClick={() => void markGivenBack(job)}>
                                {marking === job.id ? 'Guardando…' : 'Marcar devuelto'}
                            </Button>
                        </td>
                    </tr>)}
                </tbody>
            </table>
        </>}
    </>
}
