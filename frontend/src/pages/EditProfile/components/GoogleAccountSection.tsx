import { useState } from 'react'
import Button from '../../../components/Button/Button'
import GoogleButton from '../../../components/GoogleButton/GoogleButton'
import { isGoogleEnabled } from '../../../services/googleIdentity'
import { linkGoogle, unlinkGoogle } from '../../../services/userService'

export interface AccountAccess {
    /** False for an account created with Google: it has no password. */
    hasPassword: boolean
    googleLinked: boolean
}

/**
 * Whether Google is linked to the account, and the choice to link or unlink it. These are
 * immediate actions (each needs the current password), not part of the profile form: they
 * don't wait for "Guardar cambios" nor count as unsaved changes.
 */
export default function GoogleAccountSection({ access, email, onChange }: {
    access: AccountAccess; email: string; onChange: (access: AccountAccess) => void
}) {
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    async function run(action: () => Promise<{ hasPassword: boolean; googleLinked: boolean }>, done: string) {
        setError('')
        setMessage('')
        setBusy(true)
        try {
            const response = await action()
            onChange({ hasPassword: response.hasPassword, googleLinked: response.googleLinked })
            setPassword('')
            setMessage(done)
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo completar la acción. Inténtalo nuevamente.')
        } finally {
            setBusy(false)
        }
    }

    function link(credential: string) {
        if (!password) {
            setError('Ingresa tu contraseña actual para vincular tu cuenta de Google.')
            return
        }
        void run(() => linkGoogle(credential, password), 'Cuenta de Google vinculada.')
    }

    function unlink() {
        if (!password) {
            setError('Ingresa tu contraseña actual para desvincular tu cuenta de Google.')
            return
        }
        void run(() => unlinkGoogle(password), 'Cuenta de Google desvinculada.')
    }

    const { hasPassword, googleLinked } = access

    // Nothing to offer: no way to link (Google isn't set up here) and nothing linked to undo.
    if (hasPassword && !googleLinked && !isGoogleEnabled()) return null

    return (
        <section className="profile-section" aria-labelledby="google-title">
            <h2 id="google-title">Cuenta de Google</h2>
            {!hasPassword ? (
                <p className="profile-subtitle">Iniciás sesión con tu cuenta de Google. Tu cuenta no tiene contraseña de OficiosYa, por eso no se puede cambiar el correo ni desvincular Google.</p>
            ) : (
                <>
                    <p className="profile-subtitle">
                        {googleLinked
                            ? 'Tu cuenta está vinculada con Google: podés entrar con un solo click o con tu correo y contraseña.'
                            : `Vinculá tu cuenta con Google para entrar más rápido. Tiene que ser la cuenta de Google de ${email}. Es opcional: seguís pudiendo entrar con tu correo y contraseña.`}
                    </p>
                    <div className="profile-field">
                        <label htmlFor="google-current-password">Contraseña actual</label>
                        <input id="google-current-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} aria-describedby="google-password-help" disabled={busy} />
                        <small id="google-password-help">{googleLinked ? 'Necesaria para desvincular tu cuenta de Google.' : 'Escribila y después elegí tu cuenta de Google.'}</small>
                    </div>
                    {googleLinked
                        ? <div className="profile-actions"><Button type="button" variant="ghost" disabled={busy} onClick={unlink}>{busy ? 'Desvinculando…' : 'Desvincular Google'}</Button></div>
                        : <GoogleButton text="continue_with" onCredential={link} />}
                </>
            )}
            {error && <p className="profile-error" role="alert">{error}</p>}
            {message && <p className="profile-feedback" role="status">{message}</p>}
        </section>
    )
}
