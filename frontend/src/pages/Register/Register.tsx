import { useState, type FormEvent } from 'react'
import Button from '../../components/Button/Button'
import GoogleButton from '../../components/GoogleButton/GoogleButton'
import Icon from '../../components/Icon/Icon'
import { googleRegister, register } from '../../services/authService'
import { isGoogleEnabled } from '../../services/googleIdentity'
import type { AccountType, PendingVerification } from '../../types/Auth'
import VerifyEmailStep from './VerifyEmailStep'
import './Register.css'

function Brand() {
  return (
    <a className="register-brand" href="/" aria-label="OficiosYa inicio">
      <span>
        <Icon name="wrench" />
      </span>
      <strong>Oficios</strong>
      <b>Ya</b>
    </a>
  )
}

function Register() {
  const [accountType, setAccountType] = useState<AccountType>('client')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [location, setLocation] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  // Set once the code was mailed: the form gives way to the code step until the user comes back.
  const [pending, setPending] = useState<PendingVerification | null>(null)

  /** What a professional has to give besides the account data; empty when it is fine (or not a professional). */
  const professionalFieldsError = (): string => {
    if (accountType !== 'professional') return ''

    if (!location.trim()) {
      return 'Ingresá una ubicación para continuar como profesional.'
    }

    if (!/^(\+\d{1,3})?\d{9}$/.test(phoneNumber.trim())) {
      return 'Ingresá un teléfono de 9 dígitos, con prefijo internacional opcional.'
    }

    return ''
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')

    if (password !== confirmation) {
      setErrorMessage('Las contraseñas no coinciden.')
      return
    }

    if (!acceptedTerms) {
      setErrorMessage('Aceptá los términos y condiciones para continuar.')
      return
    }

    const fieldsError = professionalFieldsError()
    if (fieldsError) {
      setErrorMessage(fieldsError)
      return
    }

    setIsSubmitting(true)

    try {
      const started = await register(
        { name: name.trim(), email: email.trim(), password },
        {
          email: email.trim(),
          accountType,
          location: accountType === 'professional' ? location.trim() : null,
          phoneNumber: accountType === 'professional' ? phoneNumber.trim() : null,
        },
      )

      setPending(started)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo crear la cuenta. Intentá nuevamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Registers with the Google account picked: no password or code, Google already vouches for the email. */
  const handleGoogleCredential = async (credential: string) => {
    setErrorMessage('')

    if (!acceptedTerms) {
      setErrorMessage('Aceptá los términos y condiciones para continuar.')
      return
    }

    const fieldsError = professionalFieldsError()
    if (fieldsError) {
      setErrorMessage(fieldsError)
      return
    }

    setIsSubmitting(true)

    try {
      await googleRegister(
        credential,
        accountType,
        accountType === 'professional'
          ? { phoneNumber: phoneNumber.trim(), workingLocation: location.trim() }
          : undefined,
      )

      window.location.href = '/'
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo crear la cuenta con Google. Intentá nuevamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="register-page">
      <div className="register-decoration register-decoration--top" />
      <div className="register-decoration register-decoration--bottom" />

      <header className="register-header">
        <Brand />
        <a className="register-back-home" href="/">
          <Icon name="home" />
          Volver al inicio
        </a>
      </header>

      <section className="register-card" aria-labelledby="register-title">
        {pending ? (
          <VerifyEmailStep
            pending={pending}
            onResent={setPending}
            onChangeEmail={() => setPending(null)}
            onVerified={() => { window.location.href = '/' }}
          />
        ) : (
        <>
        <p className="register-eyebrow">CREÁ TU CUENTA</p>
        <h1 id="register-title">Sumate a OficiosYa</h1>
        <p className="register-intro">
          Elegí el tipo de cuenta y completá tus datos para empezar.
        </p>

        <div className="account-types" aria-label="Tipo de cuenta">
          <button
            className={`account-type ${accountType === 'client' ? 'is-selected' : ''}`}
            type="button"
            onClick={() => setAccountType('client')}
          >
            <span className="account-type__icon">
              <Icon name="user" />
            </span>
            <strong>Cliente</strong>
            <span>Quiero encontrar y contratar profesionales.</span>
            {accountType === 'client' && (
              <b className="account-type__check">✓</b>
            )}
          </button>

          <button
            className={`account-type ${accountType === 'professional' ? 'is-selected' : ''}`}
            type="button"
            onClick={() => setAccountType('professional')}
          >
            <span className="account-type__icon">
              <Icon name="wrench" />
            </span>
            <strong>Profesional</strong>
            <span>Quiero ofrecer mis servicios y conseguir clientes.</span>
            {accountType === 'professional' && (
              <b className="account-type__check">✓</b>
            )}
          </button>
        </div>

        <form className="register-form" onSubmit={handleSubmit}>
          <label htmlFor="register-name">Nombre y apellido</label>
          <div className="register-input">
            <Icon name="user" />
            <input
              id="register-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Ej. María González"
            />
          </div>

          <label htmlFor="register-email">Correo electrónico</label>
          <div className="register-input">
            <Icon name="mail" />
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="tu@email.com"
            />
          </div>

          {accountType === 'professional' && (
            <>
              <label htmlFor="register-phone">Número de teléfono</label>
              <div className="register-input">
                <Icon name="phone" />
                <input
                  id="register-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  required
                  placeholder="Ej. +59899123456"
                />
              </div>

              <label htmlFor="register-location">Ubicación</label>
              <div className="register-input">
                <Icon name="location" />
                <input
                  id="register-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  required
                  placeholder="Ej. Montevideo"
                />
              </div>
            </>
          )}

          <label htmlFor="register-password">Contraseña</label>
          <div className="register-input">
            <Icon name="lock" />
            <input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} />
            </button>
          </div>

          <label htmlFor="register-confirmation">Confirmar contraseña</label>
          <div className="register-input">
            <Icon name="lock" />
            <input
              id="register-confirmation"
              type={showConfirmation ? 'text' : 'password'}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8}
              required
              placeholder="Repetí tu contraseña"
            />
            <button
              type="button"
              onClick={() => setShowConfirmation(!showConfirmation)}
              aria-label={showConfirmation ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <Icon name={showConfirmation ? 'eye-off' : 'eye'} />
            </button>
          </div>

          <label className="terms">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
            />
            <span>
              Acepto los <a href="#terms">Términos y condiciones</a> de OficiosYa.
            </span>
          </label>

          <Button className="register-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </Button>

          {errorMessage && (
            <p className="register-error" role="alert">
              {errorMessage}
            </p>
          )}
        </form>

        {isGoogleEnabled() && (
          <>
            <div className="auth-divider"><span>o registrate con Google</span></div>
            <GoogleButton text="signup_with" onCredential={handleGoogleCredential} />
            <p className="register-google-hint">
              {accountType === 'professional'
                ? 'Completá teléfono y ubicación y aceptá los términos antes de continuar con Google.'
                : 'Aceptá los términos antes de continuar con Google.'}
            </p>
          </>
        )}

        <div className="register-divider" />
        <p className="register-login">
          ¿Ya tenés una cuenta? <a href="/login">Iniciar sesión</a>
        </p>
        </>
        )}
      </section>
    </main>
  )
}

export default Register
