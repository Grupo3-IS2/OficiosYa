import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../components/Button/Button'
import { resendEmailChangeCode } from '../../../services/userService'
import type { PendingVerification } from '../../../types/Auth'
import EmailChangeVerification from './EmailChangeVerification'
import './UnsavedChangesModal.css'

/**
 * Changing the email, apart from the profile form so password managers don't take it for a login:
 * first the new address and the current password, then the code mailed to that address.
 */
export default function EmailChangeModal({ currentEmail, onStart, onConfirm, onClose }: Readonly<{
    currentEmail: string
    /** Resolves with the code's terms, or with `verificationRequired: false` when it already changed. */
    onStart: (newEmail: string, currentPassword: string) => Promise<PendingVerification>
    onConfirm: (newEmail: string, code: string) => Promise<void>
    onClose: () => void
}>) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [newEmail, setNewEmail] = useState('')
    const [password, setPassword] = useState('')
    const [pending, setPending] = useState<PendingVerification | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        const previousFocus = document.activeElement
        const element = dialog.current!
        const previousOverflow = document.body.style.overflow
        element.showModal()
        document.body.style.overflow = 'hidden'
        return () => {
            element.close()
            document.body.style.overflow = previousOverflow
            if (previousFocus instanceof HTMLElement) previousFocus.focus()
        }
    }, [])

    async function start() {
        const email = newEmail.trim()
        if (email.toLowerCase() === currentEmail.toLowerCase()) {
            setError('Ese ya es tu correo actual.')
            return
        }
        setError('')
        setBusy(true)
        try {
            const started = await onStart(email, password)
            setPassword('')
            if (started.verificationRequired) setPending(started)
            else onClose()
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo cambiar el correo. Inténtalo nuevamente.')
        } finally {
            setBusy(false)
        }
    }

    async function confirm(code: string) {
        await onConfirm(pending!.email, code)
        onClose()
    }

    return createPortal(
        <dialog ref={dialog} className="unsaved-modal email-modal" aria-labelledby="email-modal-title" aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
            <header className="unsaved-modal__header">
                <span id="email-modal-title">Cambiar correo</span>
                <button type="button" aria-label="Cerrar" disabled={busy} onClick={onClose}>×</button>
            </header>
            <div className="email-modal__body">
                {pending
                    ? <EmailChangeVerification pending={pending} currentEmail={currentEmail} onConfirm={confirm}
                        onResend={() => resendEmailChangeCode(pending.email).then(renewed => { setPending(renewed); return renewed })} onCancel={onClose} />
                    : <form onSubmit={event => { event.preventDefault(); void start() }}>
                        {/* Tells password managers whose password this is, so they leave the new address alone. */}
                        <input type="email" autoComplete="username" value={currentEmail} readOnly hidden />
                        <div className="profile-field">
                            <label htmlFor="email-modal-new">Correo nuevo</label>
                            <input id="email-modal-new" name="new-email" type="email" autoComplete="off" data-bwignore data-1p-ignore data-lpignore="true"
                                required autoFocus value={newEmail} disabled={busy} onChange={event => setNewEmail(event.target.value)} aria-describedby="email-modal-help" />
                        </div>
                        <div className="profile-field">
                            <label htmlFor="email-modal-password">Contraseña actual</label>
                            <input id="email-modal-password" type="password" autoComplete="current-password" required
                                value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
                        </div>
                        {error && <p className="profile-error" role="alert">{error}</p>}
                        <div className="email-change__actions">
                            <Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar código'}</Button>
                            <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
                        </div>
                    </form>}
            </div>
        </dialog>, document.body,
    )
}
