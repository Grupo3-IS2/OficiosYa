import { useState } from 'react'
import Button from '../../../components/Button/Button'
import type { PendingVerification } from '../../../types/Auth'
import { useCountdown } from '../../Register/useCountdown'
import { formatCountdown, isCodeComplete, normalizeCode } from '../../Register/verificationCode'

/**
 * A code mailed to the account to confirm an action (unlinking Google, deleting the account): nothing is
 * mailed until it is asked for, and asking again resends it once the cooldown is over. `send` asks the
 * backend for it; the answer says its terms, or that no code is needed (verification turned off).
 */
export function useMailedCode(send: () => Promise<PendingVerification>) {
    // Null until asked for.
    const [pending, setPending] = useState<PendingVerification | null>(null)
    const [code, setCode] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')
    const { secondsLeft, restart } = useCountdown(0)

    const needsCode = pending?.verificationRequired !== false
    const codeLength = pending?.codeLength ?? 6

    async function ask() {
        const again = pending !== null
        setError('')
        setInfo('')
        setSending(true)
        try {
            const answer = await send()
            setPending(answer)
            setCode('')
            restart(answer.resendCooldownSeconds ?? 0)
            if (again) setInfo('Te enviamos un código nuevo. El anterior ya no sirve.')
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No pudimos enviarte el código. Inténtalo nuevamente.')
        } finally {
            setSending(false)
        }
    }

    return {
        pending, code, setCode, ask, sending, error, info, secondsLeft, needsCode, codeLength,
        /** What is missing before the action can go on; empty when the code is ready (or not needed). */
        problem(): string {
            if (!pending) return 'Primero pide el código de verificación: te lo enviamos a tu correo.'
            if (needsCode && !isCodeComplete(code, codeLength)) return `Ingresa el código de ${codeLength} dígitos que te enviamos.`
            return ''
        },
        reset() {
            setPending(null)
            setCode('')
            setError('')
            setInfo('')
        },
    }
}

/** The field for that code, with the button that mails it next to it. */
export default function MailedCodeField({ id, email, state, disabled = false }: Readonly<{
    id: string
    email: string
    state: ReturnType<typeof useMailedCode>
    disabled?: boolean
}>) {
    const { pending, code, setCode, ask, sending, error, info, secondsLeft, needsCode, codeLength } = state
    if (!needsCode) return null

    return <div className="profile-field">
        <label htmlFor={id}>Código de verificación</label>
        <div className="mailed-code">
            <input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={codeLength}
                placeholder={'0'.repeat(codeLength)} value={code} disabled={disabled || !pending} aria-describedby={`${id}-help`}
                onChange={event => setCode(normalizeCode(event.target.value, codeLength))} />
            <Button type="button" variant="ghost" disabled={disabled || sending || secondsLeft > 0} onClick={() => void ask()}>
                {sending ? 'Enviando…' : !pending ? 'Enviar código de verificación' : secondsLeft > 0 ? `Reenviar en ${formatCountdown(secondsLeft)}` : 'Reenviar código'}
            </Button>
        </div>
        <small id={`${id}-help`}>{pending
            ? <>Te enviamos un código de {codeLength} dígitos a <strong>{email}</strong>.</>
            : <>Te lo enviamos a <strong>{email}</strong> para confirmar que sos vos.</>}</small>
        {error && <p className="profile-error" role="alert">{error}</p>}
        {info && <output className="profile-feedback">{info}</output>}
    </div>
}
