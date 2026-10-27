import { useState } from 'react'
import Button from '../../../components/Button/Button'
import { deleteUser, startAccountDeletion } from '../../../services/userService'
import MailedCodeField, { useMailedCode } from './MailedCodeField'

/**
 * Deleting the account, at the end of the page. It asks to confirm with the current password, or with the
 * email for an account created with Google (which has none), and with a code mailed to the account. The
 * jobs stay in the other side's history, under "Cuenta eliminada".
 */
export default function DeleteAccountSection({ hasPassword, email }: Readonly<{ hasPassword: boolean; email: string }>) {
    const [confirming, setConfirming] = useState(false)
    const [confirmation, setConfirmation] = useState('')
    const mailedCode = useMailedCode(startAccountDeletion)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function remove() {
        if (!confirmation.trim()) {
            setError(hasPassword ? 'Ingresa tu contraseña actual para confirmar.' : 'Escribe el correo de tu cuenta para confirmar.')
            return
        }
        const missing = mailedCode.problem()
        if (missing) {
            setError(missing)
            return
        }
        setError('')
        setBusy(true)
        try {
            const code = mailedCode.code
            await deleteUser(hasPassword ? { currentPassword: confirmation, code } : { email: confirmation, code })
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo eliminar la cuenta. Inténtalo nuevamente.')
            setBusy(false)
        }
    }

    function cancel() {
        setConfirming(false)
        setConfirmation('')
        mailedCode.reset()
        setError('')
    }

    return (
        <section className="profile-section profile-danger" aria-labelledby="delete-account-title">
            <h2 id="delete-account-title">Eliminar cuenta</h2>
            <p className="profile-subtitle">Se borran tus datos y no vas a poder volver a entrar con esta cuenta.</p>
            {!confirming ? (
                <div className="profile-actions"><Button type="button" variant="ghost" onClick={() => setConfirming(true)}>Eliminar mi cuenta</Button></div>
            ) : (
                <>
                    <div className="profile-field">
                        <label htmlFor="delete-account-confirmation">{hasPassword ? 'Contraseña actual' : `Escribe tu correo (${email}) para confirmar`}</label>
                        <input id="delete-account-confirmation" type={hasPassword ? 'password' : 'email'} autoComplete={hasPassword ? 'current-password' : 'off'}
                            value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
                    </div>
                    <MailedCodeField id="delete-account-code" email={email} state={mailedCode} disabled={busy} />
                    <div className="email-change__actions">
                        <Button type="button" className="profile-danger__confirm" disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</Button>
                        <button type="button" disabled={busy} onClick={cancel}>Cancelar</button>
                    </div>
                </>
            )}
            {error && <p className="profile-error" role="alert">{error}</p>}
        </section>
    )
}
