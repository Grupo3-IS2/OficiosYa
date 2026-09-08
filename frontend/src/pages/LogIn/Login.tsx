import { useState, type FormEvent } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import { login } from '../../services/authService'
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

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

                <div className="login-divider" />
                <p className="create-account">
                    ¿Todavía no tenés cuenta? <a href="/register">Crear cuenta</a>
                </p>
            </section>
        </main>
    )
}

export default Login
