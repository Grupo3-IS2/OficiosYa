import { useState } from 'react'
import Button from '../../../components/Button/Button'
import type { PendingVerification } from '../../../types/Auth'
import { useCountdown } from '../../Register/useCountdown'
import { formatCountdown, isCodeComplete, normalizeCode } from '../../Register/verificationCode'

/**
 * The step after asking to change the email: a code was mailed to the new address and the
 * account keeps its current email until it is entered here.
 */
export default function EmailChangeVerification({ pending, currentEmail, onConfirm, onResend, onCancel }: {
    pending: PendingVerification
    currentEmail: string
    /** Rejects with the message to show when the code is wrong. */
    onConfirm: (code: string) => Promise<void>
    /** Resolves with the renewed terms (a new cooldown). */
    onResend: () => Promise<PendingVerification>
    onCancel: () => void
}) {
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')
    const { secondsLeft, restart } = useCountdown(pending.resendCooldownSeconds)

    const minutes = Math.round(pending.expiresInSeconds / 60)
    const canConfirm = isCodeComplete(code, pending.codeLength) && !busy
    const canResend = secondsLeft === 0 && !busy

    async function confirm() {
        if (!canConfirm) return
        setError('')
        setInfo('')
        setBusy(true)
        try {
            await onConfirm(code)
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo verificar el código. Inténtalo nuevamente.')
            setBusy(false)
        }
    }

    async function resend() {
        setError('')
        setInfo('')
        setBusy(true)
        try {
            const renewed = await onResend()
            setCode('')
            restart(renewed.resendCooldownSeconds)
            setInfo('Te enviamos un código nuevo. El anterior ya no sirve.')
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo reenviar el código. Inténtalo nuevamente.')
        } finally {
            setBusy(false)
        }
    }

    return <div className="profile-field email-change">
        <label htmlFor="email-change-code">Código de verificación</label>
        <input id="email-change-code" inputMode="numeric" autoComplete="one-time-code" maxLength={pending.codeLength}
            placeholder={'0'.repeat(pending.codeLength)} value={code} disabled={busy} aria-describedby="email-change-help"
            onChange={event => setCode(normalizeCode(event.target.value, pending.codeLength))}
            // Enter confirms the code; it must not submit the profile form this sits in.
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void confirm() } }} />
        <small id="email-change-help">
            Te enviamos un código de {pending.codeLength} dígitos a <strong>{pending.email}</strong>. Vence en {minutes} {minutes === 1 ? 'minuto' : 'minutos'}.
            Tu correo sigue siendo {currentEmail} hasta que lo ingreses.
        </small>
        <div className="email-change__actions">
            <Button type="button" disabled={!canConfirm} onClick={() => void confirm()}>{busy ? 'Verificando…' : 'Confirmar el nuevo correo'}</Button>
            <button type="button" disabled={!canResend} onClick={() => void resend()}>
                {secondsLeft > 0 ? `Reenviar código en ${formatCountdown(secondsLeft)}` : 'Reenviar código'}
            </button>
            <button type="button" disabled={busy} onClick={onCancel}>Cancelar el cambio</button>
        </div>
        {error && <p className="profile-error" role="alert">{error}</p>}
        {info && <p className="profile-feedback" role="status">{info}</p>}
    </div>
}
