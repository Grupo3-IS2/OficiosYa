import { useState, type SubmitEvent } from 'react'
import Button from '../../components/Button/Button'
import { resendCode, verifyEmail } from '../../services/authService'
import type { PendingVerification } from '../../types/Auth'
import { useCountdown } from './useCountdown'
import { formatCountdown, isCodeComplete, normalizeCode } from './verificationCode'

interface VerifyEmailStepProps {
  pending: PendingVerification
  /** The mailed code was sent again: carries the new terms (cooldown, expiry). */
  onResent: (pending: PendingVerification) => void
  /** Back to the form, keeping what was typed, to fix the email. */
  onChangeEmail: () => void
  onVerified: () => void
}

function VerifyEmailStep({ pending, onResent, onChangeEmail, onVerified }: VerifyEmailStepProps) {
  const [code, setCode] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const { secondsLeft, restart } = useCountdown(pending.resendCooldownSeconds)

  const expiresInMinutes = Math.round(pending.expiresInSeconds / 60)
  const canVerify = isCodeComplete(code, pending.codeLength) && !isVerifying
  const canResend = secondsLeft === 0 && !isResending

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canVerify) return

    setErrorMessage('')
    setInfoMessage('')
    setIsVerifying(true)

    try {
      await verifyEmail(pending.email, code)
      onVerified()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo verificar el código. Intentá nuevamente.',
      )
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    setErrorMessage('')
    setInfoMessage('')
    setIsResending(true)

    try {
      const renewed = await resendCode(pending.email)
      setCode('')
      restart(renewed.resendCooldownSeconds)
      onResent(renewed)
      setInfoMessage('Te enviamos un código nuevo. El anterior ya no sirve.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo reenviar el código. Intentá nuevamente.',
      )
    } finally {
      setIsResending(false)
    }
  }

  return (
    <>
      <p className="register-eyebrow">VERIFICÁ TU CORREO</p>
      <h1 id="register-title">Ingresá el código</h1>
      <p className="register-intro">
        Te enviamos un código de {pending.codeLength} dígitos a <strong>{pending.email}</strong>.
        Vence en {expiresInMinutes} {expiresInMinutes === 1 ? 'minuto' : 'minutos'}.
        Tu cuenta se crea cuando lo ingreses.
      </p>

      <form className="register-form" onSubmit={handleSubmit}>
        <label htmlFor="register-code">Código de verificación</label>
        <input
          id="register-code"
          className="register-code"
          value={code}
          onChange={(event) => setCode(normalizeCode(event.target.value, pending.codeLength))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={pending.codeLength}
          placeholder={'0'.repeat(pending.codeLength)}
          aria-describedby="register-code-help"
          autoFocus
          required
        />
        <small id="register-code-help" className="register-code-help">
          Revisá también la carpeta de spam.
        </small>

        <Button className="register-submit" type="submit" disabled={!canVerify}>
          {isVerifying ? 'Verificando...' : 'Verificar y crear cuenta'}
        </Button>

        {errorMessage && (
          <p className="register-error" role="alert">
            {errorMessage}
          </p>
        )}
        {infoMessage && (
          <output className="register-info">
            {infoMessage}
          </output>
        )}
      </form>

      <div className="register-divider" />
      <div className="register-code-actions">
        <button type="button" onClick={handleResend} disabled={!canResend}>
          {secondsLeft > 0
            ? `Reenviar código en ${formatCountdown(secondsLeft)}`
            : isResending ? 'Reenviando...' : 'Reenviar código'}
        </button>
        <button type="button" onClick={onChangeEmail}>
          Cambiar correo
        </button>
      </div>
    </>
  )
}

export default VerifyEmailStep
