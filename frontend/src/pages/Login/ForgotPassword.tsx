import { useState, type SubmitEvent } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import { completePasswordReset, startPasswordReset } from '../../services/authService'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_HINT } from '../../services/passwordPolicy'
import type { PendingVerification } from '../../types/Auth'
import { useCountdown } from '../Register/useCountdown'
import { formatCountdown, isCodeComplete, normalizeCode } from '../Register/verificationCode'
import { Brand } from './Login'
import './Login.css'

const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

/** "¿Olvidaste tu contraseña?": the email, then the mailed code with the new password. */
function ForgotPassword() {
    const [email, setEmail] = useState('')
    const [pending, setPending] = useState<PendingVerification | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')

    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()
        setErrorMessage('')
        setIsSubmitting(true)

        try {
            setPending(await startPasswordReset(email.trim()))
        } catch (error) {
            setErrorMessage(errorText(error, 'No se pudo enviar el código. Intentá nuevamente.'))
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <main className="login-page">
            <div className="login-decoration login-decoration--top" />
            <div className="login-decoration login-decoration--bottom" />

            <header className="login-header">
                <Brand />
                <a className="back-home" href="/login">
                    <Icon name="lock" />
                    Volver a iniciar sesión
                </a>
            </header>

            <section className="login-card" aria-labelledby="forgot-title">
                {pending ? (
                    <ResetStep pending={pending} onResent={setPending} onChangeEmail={() => setPending(null)} />
                ) : (
                    <>
                        <div className="login-heading">
                            <h1 id="forgot-title">¿Olvidaste tu contraseña?</h1>
                            <p>Escribí el correo de tu cuenta y te enviamos un código para elegir una nueva.</p>
                        </div>

                        <form className="login-form" onSubmit={handleSubmit}>
                            <label htmlFor="forgot-email">Correo electrónico</label>
                            <div className="login-input-wrap">
                                <Icon name="mail" />
                                <input
                                    id="forgot-email"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="tu@email.com"
                                    autoComplete="email"
                                    autoFocus
                                    required
                                />
                            </div>

                            <Button className="login-submit" type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Enviando...' : 'Enviar código'}
                            </Button>

                            {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
                        </form>
                    </>
                )}

                <div className="login-divider" />
                <p className="create-account">
                    ¿Te acordaste? <a href="/login">Iniciar sesión</a>
                </p>
            </section>
        </main>
    )
}

interface ResetStepProps {
    pending: PendingVerification
    onResent: (pending: PendingVerification) => void
    onChangeEmail: () => void
}

function ResetStep({ pending, onResent, onChangeEmail }: Readonly<ResetStepProps>) {
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isResending, setIsResending] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [infoMessage, setInfoMessage] = useState('')
    const { secondsLeft, restart } = useCountdown(pending.resendCooldownSeconds)

    const expiresInMinutes = Math.round(pending.expiresInSeconds / 60)

    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()
        setErrorMessage('')
        setInfoMessage('')
        if (!isCodeComplete(code, pending.codeLength)) {
            setErrorMessage(`Ingresá el código de ${pending.codeLength} dígitos.`)
            return
        }
        if (password !== confirmation) {
            setErrorMessage('Las contraseñas no coinciden.')
            return
        }

        setIsSubmitting(true)
        try {
            await completePasswordReset(pending.email, code, password, confirmation)
            window.location.href = '/login?reset=1'
        } catch (error) {
            setErrorMessage(errorText(error, 'No se pudo cambiar la contraseña. Intentá nuevamente.'))
            setIsSubmitting(false)
        }
    }

    const handleResend = async () => {
        setErrorMessage('')
        setInfoMessage('')
        setIsResending(true)

        try {
            const renewed = await startPasswordReset(pending.email)
            setCode('')
            restart(renewed.resendCooldownSeconds)
            onResent(renewed)
            setInfoMessage('Si hay una cuenta con ese correo, te enviamos un código nuevo. El anterior ya no sirve.')
        } catch (error) {
            setErrorMessage(errorText(error, 'No se pudo reenviar el código. Intentá nuevamente.'))
        } finally {
            setIsResending(false)
        }
    }

    return (
        <>
            <div className="login-heading">
                <h1 id="forgot-title">Elegí una contraseña nueva</h1>
                <p>
                    Si <strong>{pending.email}</strong> tiene una cuenta, le enviamos un código
                    de {pending.codeLength} dígitos que vence
                    en {expiresInMinutes} {expiresInMinutes === 1 ? 'minuto' : 'minutos'}. Revisá también la carpeta de spam.
                </p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
                <label htmlFor="reset-code">Código</label>
                <div className="login-input-wrap">
                    <Icon name="mail" />
                    <input
                        id="reset-code"
                        value={code}
                        onChange={(event) => setCode(normalizeCode(event.target.value, pending.codeLength))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={pending.codeLength}
                        placeholder={'0'.repeat(pending.codeLength)}
                        autoFocus
                        required
                    />
                </div>

                <label htmlFor="reset-password">Contraseña nueva</label>
                <div className="login-input-wrap">
                    <Icon name="lock" />
                    <input
                        id="reset-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        aria-describedby="reset-password-hint"
                        minLength={MIN_PASSWORD_LENGTH}
                        maxLength={MAX_PASSWORD_LENGTH}
                        required
                    />
                    <button
                        type="button"
                        className="password-toggle"
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        onClick={() => setShowPassword((isVisible) => !isVisible)}
                    >
                        <Icon name={showPassword ? 'eye-off' : 'eye'} />
                    </button>
                </div>
                <small id="reset-password-hint" className="login-hint">
                    {PASSWORD_HINT}
                </small>

                <label htmlFor="reset-confirmation">Repetí la contraseña nueva</label>
                <div className="login-input-wrap">
                    <Icon name="lock" />
                    <input
                        id="reset-confirmation"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        autoComplete="new-password"
                        required
                    />
                </div>

                <Button className="login-submit" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Guardando...' : 'Cambiar contraseña'}
                </Button>

                {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
                {infoMessage && <output className="login-notice login-notice--success">{infoMessage}</output>}
            </form>

            <div className="login-secondary-actions">
                <button type="button" onClick={handleResend} disabled={secondsLeft > 0 || isResending}>
                    {secondsLeft > 0
                        ? `Reenviar código en ${formatCountdown(secondsLeft)}`
                        : isResending ? 'Reenviando...' : 'Reenviar código'}
                </button>
                <button type="button" onClick={onChangeEmail}>Usar otro correo</button>
            </div>
        </>
    )
}

export default ForgotPassword
