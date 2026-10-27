import { useRef, useState, type SubmitEvent } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import { completeJobRequest } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import { completionPin, type RequestOutcome } from './requestResponse'

export default function CompleteRequestSection({ request, onCompleted, onBusyChange }: Readonly<{
    request: JobRequest
    onCompleted: (updated: JobRequest, outcome: RequestOutcome) => void
    onBusyChange: (busy: boolean) => void
}>) {
    const [pin, setPin] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const inFlight = useRef(false)

    async function complete(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        if (inFlight.current) return
        const result = completionPin(pin)
        if ('error' in result) { setError(result.error); return }
        inFlight.current = true
        setBusy(true)
        onBusyChange(true)
        setError('')
        try {
            const updated = await completeJobRequest(request.id, result.pin)
            setPin('')
            onCompleted(updated, 'completed')
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No pudimos completar el trabajo. Intentá nuevamente.')
        } finally {
            inFlight.current = false
            setBusy(false)
            onBusyChange(false)
        }
    }

    return <section className="request-callout request-callout--complete" aria-labelledby="request-complete-title" aria-busy={busy}>
        <div className="request-callout__heading">
            <Icon name="check" />
            <div><h3 id="request-complete-title">Completar trabajo</h3><strong>Ingresá el PIN que te muestra {request.clientName}</strong></div>
        </div>
        <p id="request-complete-help">Pedile el PIN al cliente una vez que el trabajo esté terminado. Al confirmarlo, la solicitud quedará completada.</p>
        <form className="request-response__form" onSubmit={event => { void complete(event) }}>
            <label className="request-response__field request-response__field--wide" htmlFor="request-complete-pin">
                PIN del cliente
                <input id="request-complete-pin" className="request-complete-pin" type="text" inputMode="numeric" autoComplete="off"
                    placeholder="6 dígitos" maxLength={6} value={pin} disabled={busy} spellCheck={false}
                    aria-invalid={Boolean(error)} aria-describedby={error ? 'request-complete-help request-complete-error' : 'request-complete-help'}
                    onChange={event => { setPin(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} />
            </label>
            {error && <p id="request-complete-error" className="request-response__error" role="alert">{error}</p>}
            <div className="request-response__actions"><Button type="submit" disabled={busy || pin.length !== 6}>
                {busy ? 'Confirmando PIN…' : 'Confirmar PIN y completar'}
            </Button></div>
        </form>
    </section>
}
