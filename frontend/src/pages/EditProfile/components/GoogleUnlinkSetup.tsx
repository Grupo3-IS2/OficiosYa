import { useState } from 'react'
import Button from '../../../components/Button/Button'
import { completePasswordSetup, startPasswordSetup, unlinkGoogle } from '../../../services/userService'
import MailedCodeField, { useMailedCode } from './MailedCodeField'

/**
 * Unlinking Google from an account created with it. Without Google it needs another way in, so the same
 * step gives it a password: a code mailed to the account's email proves it is the owner (not just someone
 * with the session open), the password is created, and then Google is unlinked with it.
 */
export default function GoogleUnlinkSetup({ email, onDone }: Readonly<{
    email: string
    /** The account afterwards. If the unlink itself failed it has a password but is still linked. */
    onDone: (account: { hasPassword: boolean; googleLinked: boolean }) => void
}>) {
    // "Desvincular de Google" opens the form; the code is mailed only when asked for there.
    const [open, setOpen] = useState(false)
    const mailedCode = useMailedCode(startPasswordSetup)
    const [password, setPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function create() {
        const missing = mailedCode.problem()
        if (missing) {
            setError(missing)
            return
        }
        if (password !== confirmation) {
            setError('Las contraseñas no coinciden.')
            return
        }
        setError('')
        setBusy(true)
        try {
            const account = await completePasswordSetup(mailedCode.code, password, confirmation)
            try {
                const unlinked = await unlinkGoogle(password)
                onDone({ hasPassword: unlinked.hasPassword, googleLinked: unlinked.googleLinked })
            } catch {
                // The password is already there: the section offers the usual unlink, with it.
                onDone({ hasPassword: account.hasPassword, googleLinked: account.googleLinked })
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No pudimos desvincular tu cuenta de Google. Inténtalo nuevamente.')
            setBusy(false)
        }
    }

    function cancel() {
        setOpen(false)
        mailedCode.reset()
        setPassword('')
        setConfirmation('')
        setError('')
    }

    if (!open) {
        return <div className="profile-actions"><Button type="button" variant="ghost" onClick={() => setOpen(true)}>Desvincular de Google</Button></div>
    }

    return <div className="password-setup">
        <MailedCodeField id="password-setup-code" email={email} state={mailedCode} disabled={busy} />
        <div className="profile-password-grid">
            <div className="profile-field">
                <label htmlFor="password-setup-new">Nueva contraseña</label>
                <input id="password-setup-new" type="password" autoComplete="new-password" minLength={8} value={password} disabled={busy}
                    aria-describedby="password-setup-rules" onChange={event => setPassword(event.target.value)} />
                <small id="password-setup-rules">Usa al menos 8 caracteres, con mayúscula, minúscula, número y símbolo.</small>
            </div>
            <div className="profile-field">
                <label htmlFor="password-setup-confirm">Confirmar contraseña</label>
                <input id="password-setup-confirm" type="password" autoComplete="new-password" value={confirmation} disabled={busy}
                    onChange={event => setConfirmation(event.target.value)} />
            </div>
        </div>
        <div className="email-change__actions">
            <Button type="button" className="profile-danger__confirm" disabled={busy} onClick={() => void create()}>{busy ? 'Desvinculando…' : 'Crear contraseña y desvincular'}</Button>
            <button type="button" disabled={busy} onClick={cancel}>Cancelar</button>
        </div>
        {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
}
