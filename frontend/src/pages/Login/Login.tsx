import { useState, type SubmitEvent } from 'react'
import Button from '../../components/Button/Button'
import GoogleButton from '../../components/GoogleButton/GoogleButton'
import Icon from '../../components/Icon/Icon'
import { ApiError } from '../../services/api'
import { googleLink, googleLogin, login } from '../../services/authService'
import { emailFromCredential } from '../../services/googleCredential'
import { isGoogleEnabled } from '../../services/googleIdentity'
import LinkGoogleModal from './LinkGoogleModal'
import './Login.css'

function Brand() {
    return (
        <a className="login-brand" href="/" aria-label="OficiosYa inicio">
            <span>
                <Icon name="wrench" />
            </span>
            <strong>Oficios</strong>
            <b>Ya</b>
        </a>
    )
}

function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    // The Google token of someone whose email already has a password account: waiting for them
    // to choose whether to link it.
    const [credentialToLink, setCredentialToLink] = useState<string | null>(null)
    const [sessionExpired] = useState(
        () => new URLSearchParams(window.location.search).get('expired') === '1',
    )

    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()
        setErrorMessage('')
        setIsSubmitting(true)

        try {
            await login({ email: email.trim(), password })
            window.location.href = '/'
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'No se pudo iniciar sesión.',
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleGoogleCredential = async (credential: string) => {
        setErrorMessage('')

        try {
            await googleLogin(credential)
            window.location.href = '/'
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
                setCredentialToLink(credential)
                return
            }
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'No se pudo iniciar sesión con Google.',
            )
        }
    }

    return (
        <main className="login-page">
            <div className="login-decoration login-decoration--top" />
            <div className="login-decoration login-decoration--bottom" />

            <header className="login-header">
                <Brand />
                <a className="back-home" href="/">
                    <Icon name="home" />
                    Volver al inicio
                </a>
            </header>

            <section className="login-card" aria-labelledby="login-title">
                <div className="login-heading">
                    <h1 id="login-title">¡Bienvenido de nuevo!</h1>
                    <p>
                        Iniciá sesión para seguir conectando con grandes
                        profesionales.
                    </p>
                </div>

                {sessionExpired && (
                    <output className="login-notice">
                        Tu sesión venció. Iniciá sesión nuevamente.
                    </output>
                )}

                <form className="login-form" onSubmit={handleSubmit}>
                    <label htmlFor="email">Correo electrónico</label>
                    <div className="login-input-wrap">
                        <Icon name="mail" />
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="tu@email.com"
                            autoComplete="email"
                            required
                        />
                    </div>

                    <label htmlFor="password">Contraseña</label>
                    <div className="login-input-wrap">
                        <Icon name="lock" />
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Ingresá tu contraseña"
                            autoComplete="current-password"
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

                    <a className="forgot-password" href="#forgot-password">
                        ¿Olvidaste tu contraseña?
                    </a>

                    <Button className="login-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Ingresando...' : 'Iniciar sesión'}
                    </Button>

                    {errorMessage && (
                        <p className="login-error" role="alert">
                            {errorMessage}
                        </p>
                    )}
                </form>

                {isGoogleEnabled() && (
                    <>
                        <div className="auth-divider"><span>o</span></div>
                        <GoogleButton text="signin_with" onCredential={handleGoogleCredential} />
                    </>
                )}

                <div className="login-divider" />
                <p className="create-account">
                    ¿Todavía no tenés cuenta? <a href="/register">Crear cuenta</a>
                </p>
            </section>

            {credentialToLink && (
                <LinkGoogleModal
                    email={emailFromCredential(credentialToLink)}
                    onLink={async (password) => {
                        await googleLink(credentialToLink, password)
                        window.location.href = '/'
                    }}
                    onCancel={() => setCredentialToLink(null)}
                />
            )}
        </main>
    )
}

export default Login
