import { useState } from 'react'
import { updateNotifications } from '../../../services/userService'

/**
 * The emails about the user's requests: when the other side asks to change a job's timeframe, and
 * when the requests waiting for their answer pile up. Like the Google account it is an immediate
 * action, not part of the profile form: it saves as soon as it is switched.
 */
export default function NotificationsSection({ enabled, onChange }: Readonly<{
    enabled: boolean
    onChange: (enabled: boolean) => void
}>) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    async function toggle(next: boolean) {
        // The switch moves at once; if saving fails it goes back to how it was
        onChange(next)
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const response = await updateNotifications(next)
            onChange(response.emailNotifications)
            setMessage(response.emailNotifications
                ? 'Listo: vas a recibir los avisos por correo.'
                : 'Listo: ya no vas a recibir avisos por correo.')
        } catch (reason) {
            onChange(!next)
            setError(reason instanceof Error ? reason.message : 'No se pudo guardar. Inténtalo nuevamente.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="profile-section" aria-labelledby="notifications-title" aria-busy={busy}>
            <h2 id="notifications-title">Avisos por correo</h2>
            <p className="profile-subtitle">Te escribimos sólo cuando algo de tus solicitudes necesita tu respuesta.</p>
            <label className="profile-availability">
                <input type="checkbox" role="switch" checked={enabled} disabled={busy}
                    onChange={event => { void toggle(event.target.checked) }} />
                <span>
                    Recibir avisos por correo
                    <small>Cuando te piden cambiar el horario de un trabajo, y cuando se te juntan varias solicitudes sin responder.</small>
                </span>
            </label>
            {error && <p className="profile-error" role="alert">{error}</p>}
            {message && <output className="profile-feedback">{message}</output>}
        </section>
    )
}
