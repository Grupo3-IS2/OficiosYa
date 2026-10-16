import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import { cancelJobRequest } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import { REASON_MAX_LENGTH, optionalReason, type RequestOutcome } from './requestResponse'

/**
 * The confirmation before dropping a request, for either side. Once accepted it frees the
 * professional's agenda, and the backend only allows it with enough notice: its message says how much.
 */
export default function CancelRequestSection({ request, isClient, onCancelled, onBack, onBusyChange }: Readonly<{
    request: JobRequest
    isClient: boolean
    onCancelled: (updated: JobRequest, outcome: RequestOutcome) => void
    onBack: () => void
    onBusyChange: (busy: boolean) => void
}>) {
    const section = useRef<HTMLElement>(null)
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // It opens from the footer: bring it into view so the confirmation isn't missed
    useEffect(() => {
        section.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        section.current?.querySelector('textarea')?.focus({ preventScroll: true })
    }, [])

    async function cancel(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        const result = optionalReason(reason)
        if ('error' in result) {
            setError(result.error)
            return
        }

        setBusy(true)
        onBusyChange(true)
        setError('')
        try {
            onCancelled(await cancelJobRequest(request.id, result.reason), 'cancelled')
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No se pudo cancelar la solicitud. Intentá nuevamente.')
        } finally {
            setBusy(false)
            onBusyChange(false)
        }
    }

    const accepted = request.status !== 'PROPOSED'
    const counterpart = isClient ? request.professionalName : request.clientName
    const consequence = !accepted
        ? `${counterpart} todavía no la respondió.`
        : isClient
            ? `${counterpart} ya la aceptó: se libera el horario reservado.`
            : `Ya la aceptaste: se libera el horario de tu agenda y ${counterpart} va a ver que la cancelaste.`

    return <section ref={section} className="request-callout request-callout--danger" aria-labelledby="request-cancel-title" aria-busy={busy}>
        <div className="request-callout__heading">
            <Icon name="close" />
            <div>
                <h3 id="request-cancel-title">¿Cancelar la solicitud?</h3>
                <strong>{consequence}</strong>
            </div>
        </div>
        <form className="request-response__form" onSubmit={event => { void cancel(event) }}>
            <label className="request-response__field request-response__field--wide">
                Motivo (opcional)
                <textarea rows={3} maxLength={REASON_MAX_LENGTH} value={reason} disabled={busy}
                    placeholder={`Contale a ${counterpart} por qué la cancelás.`}
                    onChange={event => setReason(event.target.value)} />
            </label>
            {error && <p className="request-response__error" role="alert">{error}</p>}
            <div className="request-response__actions">
                <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>No, mantenerla</Button>
                <Button type="submit" className="request-response__reject" disabled={busy}>{busy ? 'Cancelando…' : 'Sí, cancelar solicitud'}</Button>
            </div>
        </form>
    </section>
}
