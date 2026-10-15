import { useState } from 'react'
import Button from '../../../components/Button/Button'
import GoogleButton from '../../../components/GoogleButton/GoogleButton'
import { isGoogleEnabled } from '../../../services/googleIdentity'
import { linkGoogle, unlinkGoogle } from '../../../services/userService'
import GoogleUnlinkSetup from './GoogleUnlinkSetup'

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
    // Linking needs Google set up here; unlinking doesn't
    const canManage = googleLinked || isGoogleEnabled()

    // Nothing to offer: no way to link and nothing linked to undo. It stays while it has something
    // to say, like the confirmation of the unlink that just left nothing to offer.
    if (hasPassword && !canManage && !message) return null

    return (
        // Linked, what it offers is unlinking: shown in red, like deleting the account below it.
        <section className={`profile-section${googleLinked ? ' profile-danger' : ''}`} aria-labelledby="google-title">
            <h2 id="google-title">Cuenta de Google</h2>
            {!hasPassword ? (
                <>
                    <p className="profile-subtitle">Tu cuenta está vinculada con Google.</p>
                    <GoogleUnlinkSetup email={email} onDone={account => {
                        onChange(account)
                        setMessage(account.googleLinked
                            ? 'Tu cuenta ya tiene contraseña, pero no pudimos Desvincular de Google. Inténtalo de nuevo con tu nueva contraseña.'
                            : 'Cuenta de Google desvinculada. Desde ahora entrás con tu correo y tu nueva contraseña.')
                    }} />
                </>
            ) : canManage && (
                <>
                    <p className="profile-subtitle">
                        {googleLinked
                            ? 'Tu cuenta está vinculada con Google.'
                            : `Vinculá tu cuenta con Google para entrar más rápido.`}
                    </p>
                    <div className="profile-field">
                        <label htmlFor="google-current-password">Contraseña actual</label>
                        <input id="google-current-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} aria-describedby="google-password-help" disabled={busy} />
                        <small id="google-password-help">{googleLinked ? 'Necesaria para desvincular tu cuenta de Google.' : 'Escribila y después elegí tu cuenta de Google.'}</small>
                    </div>
                    {googleLinked
                        ? <div className="profile-actions"><Button type="button" variant="ghost" disabled={busy} onClick={unlink}>{busy ? 'Desvinculando…' : 'Desvincular de Google'}</Button></div>
                        : <GoogleButton text="continue_with" onCredential={link} />}
                </>
            )}
            {error && <p className="profile-error" role="alert">{error}</p>}
            {message && <output className="profile-feedback">{message}</output>}
        </section>
    )
}
