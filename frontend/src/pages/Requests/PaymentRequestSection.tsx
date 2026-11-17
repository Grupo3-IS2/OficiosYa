import { useState } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import { startPayment } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'

/**
 * The client pays the accepted job on Mercado Pago in a new tab (this one if pop-ups are blocked), which comes
 * back to /mis-solicitudes?request={id}; the job turns RETAINED once Mercado Pago confirms it to the backend, not on coming back.
 */
export default function PaymentRequestSection({ request, isClient }: Readonly<{
    request: JobRequest
    isClient: boolean
}>) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function pay() {
        setBusy(true)
        setError('')
        // Opened before the await: browsers block pop-ups that don't come straight from the click
        const tab = window.open('', '_blank')
        if (tab) tab.opener = null
        try {
            const url = await startPayment(request.id)
            if (tab) {
                tab.location.href = url
                setBusy(false)
            } else {
                window.location.assign(url)
            }
        } catch (failure) {
            tab?.close()
            setError(failure instanceof Error ? failure.message : 'No pudimos iniciar el pago. Intentá nuevamente.')
            setBusy(false)
        }
    }

    return <section className="request-callout request-callout--urgent" aria-labelledby="request-payment-title" aria-busy={busy}>
        <div className="request-callout__heading">
            <Icon name="money" />
            <div>
                <h3 id="request-payment-title">Pago pendiente</h3>
                <strong>{isClient ? 'Pagá el trabajo para confirmarlo' : `Esperando el pago de ${request.clientName}`}</strong>
            </div>
        </div>
        <p>{isClient
            ? 'OficiosYa guarda el dinero y se lo libera al profesional recién cuando le muestres el PIN. Si el trabajo se cancela, te lo devolvemos.'
            : 'Vas a poder completar el trabajo y ver sus datos de contacto cuando lo pague.'}</p>
        {error && <p className="request-response__error" role="alert">{error}</p>}
        {isClient && <div className="request-response__actions">
            <Button type="button" disabled={busy} onClick={() => void pay()}>
                {busy ? 'Abriendo Mercado Pago…' : 'Pagar con Mercado Pago'}
            </Button>
        </div>}
    </section>
}
