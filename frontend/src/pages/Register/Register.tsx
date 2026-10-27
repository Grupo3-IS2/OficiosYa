import { useEffect, useState, type SubmitEvent } from 'react'
import Button from '../../components/Button/Button'
import GoogleButton from '../../components/GoogleButton/GoogleButton'
import PhoneField from '../../components/PhoneField/PhoneField'
import ZonePicker, { type ZonePoint } from '../../components/ZonePicker/ZonePicker'
import RadiusField, { DEFAULT_RADIUS_KM } from '../../components/RadiusField/RadiusField'
import Icon from '../../components/Icon/Icon'
import { googleRegister, register } from '../../services/authService'
import { profileFromCredential, takeGoogleSignup } from '../../services/googleCredential'
import { isGoogleEnabled } from '../../services/googleIdentity'
import type { AccountType, PendingVerification } from '../../types/Auth'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../services/passwordPolicy'
import { joinSpanish, missingToRegister } from './registerRequirements'
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

/** The Google account picked to sign up with, and the name on it. */
interface GoogleSignup {
  credential: string
  expiresAt: number | null
  name: string
}

/** The message of an error, or the fallback when it is not one of ours. */
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

interface AccountTypeChoiceProps {
  readonly selected: boolean
  readonly icon: 'user' | 'wrench'
  readonly title: string
  readonly description: string
  readonly onSelect: () => void
}

function AccountTypeChoice({ selected, icon, title, description, onSelect }: AccountTypeChoiceProps) {
  return (
    <button className={`account-type ${selected ? 'is-selected' : ''}`} type="button" onClick={onSelect}>
      <span className="account-type__icon">
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      <span>{description}</span>
      {selected && <b className="account-type__check">✓</b>}
    </button>
  )
}

function Register() {
  const [accountType, setAccountType] = useState<AccountType>('client')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [location, setLocation] = useState('')
  // Where on the map the zone was chosen: null while it is only typed, and then no area is sent.
  const [point, setPoint] = useState<ZonePoint | null>(null)
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  // Whole, with the country's prefix: "+59899123456".
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  // Set once the code was mailed: the form gives way to the code step until the user comes back.
  const [pending, setPending] = useState<PendingVerification | null>(null)
  // The Google account picked: its name and email fill the form, and the account is made with it instead of a password.
  const [google, setGoogle] = useState<GoogleSignup | null>(null)
  const [googleNotice, setGoogleNotice] = useState('')

  const missing = () => missingToRegister(accountType, phoneNumber, location, acceptedTerms)
  const serviceArea = point ? { latitude: point.lat, longitude: point.lon, radiusKm } : null

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')

    if (google) {
      await finishWithGoogle(google)
      return
    }

    if (password !== confirmation) {
      setErrorMessage('Las contraseñas no coinciden.')
      return
    }

    const toDo = missing()
    if (toDo.length > 0) {
      setErrorMessage(`Para continuar, ${joinSpanish(toDo)}.`)
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
          phoneNumber: accountType === 'professional' ? phoneNumber : null,
          serviceArea: accountType === 'professional' ? serviceArea : null,
        },
      )

      if (started.verificationRequired) {
        setPending(started)
      } else {
        globalThis.location.href = '/'
      }
    } catch (error) {
      setErrorMessage(errorText(error, 'No se pudo crear la cuenta. Intentá nuevamente.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * The Google account was picked: its name and email fill the form. If nothing else is missing the account is
   * made right away; if something is, the form says what, and "Crear cuenta" finishes it.
   */
  const handleGoogleCredential = async (credential: string, fromLogin = false) => {
    setErrorMessage('')
    const profile = profileFromCredential(credential)
    if (!profile) {
      setErrorMessage('No pudimos leer los datos de tu cuenta de Google. Intentá nuevamente.')
      return
    }

    const picked = { credential, expiresAt: profile.expiresAt, name: profile.name }
    setGoogle(picked)
    setName(profile.name)
    setEmail(profile.email)

    const toDo = missing()
    if (toDo.length > 0) {
      const intro = fromLogin ? 'Todavía no tenés una cuenta con ese Google, así que te trajimos a crearla. ' : ''
      setGoogleNotice(`${intro}Completamos tus datos con Google. Para terminar, ${joinSpanish(toDo)}, y tocá «Crear cuenta».`)
      return
    }
    // The name just filled in: the state still holds the one from before Google.
    await finishWithGoogle(picked, profile.name)
  }

  // Coming from login with a Google account that has no account here: the form starts filled in with it.
  useEffect(() => {
    const credential = takeGoogleSignup()
    if (credential) void handleGoogleCredential(credential, true)
  }, [])

  /** Forgets the Google account: the form is filled by hand again, with a password. */
  const forgetGoogleAccount = () => {
    setGoogle(null)
    setGoogleNotice('')
    setErrorMessage('')
    setName('')
    setEmail('')
  }

  /** Registers with the Google account picked: no password or code, Google already vouches for the email. */
  const finishWithGoogle = async ({ credential, expiresAt, name: googleName }: GoogleSignup, chosenName = name) => {
    setErrorMessage('')

    const toDo = missing()
    if (toDo.length > 0) {
      setErrorMessage(`Para continuar, ${joinSpanish(toDo)}.`)
      return
    }

    // Google's token lasts about an hour: past that, it has to be picked again.
    if (expiresAt !== null && expiresAt <= Date.now()) {
      forgetGoogleAccount()
      setErrorMessage('Pasó demasiado tiempo desde que elegiste tu cuenta de Google. Tocá el botón de Google de nuevo.')
      return
    }

    setGoogleNotice('')
    setIsSubmitting(true)

    try {
      await googleRegister(
        credential,
        accountType,
        accountType === 'professional'
          ? { phoneNumber, workingLocation: location.trim(), ...(serviceArea && { serviceArea }) }
          : undefined,
        chosenName.trim() !== googleName ? chosenName.trim() : undefined,
      )

      window.location.href = '/'
    } catch (error) {
      setErrorMessage(errorText(error, 'No se pudo crear la cuenta con Google. Intentá nuevamente.'))
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
          <AccountTypeChoice
            selected={accountType === 'client'}
            icon="user"
            title="Cliente"
            description="Quiero encontrar y contratar profesionales."
            onSelect={() => setAccountType('client')}
          />
          <AccountTypeChoice
            selected={accountType === 'professional'}
            icon="wrench"
            title="Profesional"
            description="Quiero ofrecer mis servicios y conseguir clientes."
            onSelect={() => setAccountType('professional')}
          />
        </div>

        <form className="register-form" onSubmit={handleSubmit}>
          {google && (
            <div className="register-google-account">
              <p>Vas a crear tu cuenta con Google. Tu correo viene de esa cuenta; el nombre lo podés cambiar.</p>
              <button type="button" onClick={forgetGoogleAccount}>Usar otro método</button>
            </div>
          )}

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
              readOnly={google !== null}
              required
              placeholder="tu@email.com"
            />
          </div>

          {accountType === 'professional' && (
            <>
              <label htmlFor="register-phone">Número de teléfono</label>
              <div className="register-input">
                <Icon name="phone" />
                <PhoneField id="register-phone" value={phoneNumber} onChange={setPhoneNumber} required />
              </div>

              <label htmlFor="register-location">Ubicación</label>
              <div className="register-input">
                <Icon name="location" />
                <input
                  id="register-location"
                  value={location}
                  onChange={(event) => { setLocation(event.target.value); setPoint(null) }}
                  required
                  placeholder="Ej. Cordón, Montevideo"
                />
              </div>
              <ZonePicker query={location} onChoose={(label, chosen) => { setLocation(label); setPoint(chosen) }}
                radiusKm={point ? radiusKm : undefined} />
              {point
                ? <RadiusField id="register-radius" value={radiusKm} onChange={setRadiusKm} />
                : <small className="register-hint">Elegí una sugerencia o tocá el mapa para marcar desde dónde trabajás y hasta dónde llegás.</small>}
            </>
          )}

          {!google && (
            <>
              <label htmlFor="register-password">Contraseña</label>
              <div className="register-input">
                <Icon name="lock" />
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  required
                  placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
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
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
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
            </>
          )}

          <label className="terms">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
            />
            <span>
              Acepto los <a href="/terminos" target="_blank" rel="noreferrer">Términos y condiciones</a> de OficiosYa.
            </span>
          </label>

          <Button className="register-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creando cuenta...' : google ? 'Crear cuenta con Google' : 'Crear cuenta'}
          </Button>

          {googleNotice && !errorMessage && <p className="register-google-notice" role="status">{googleNotice}</p>}

          {errorMessage && (
            <p className="register-error" role="alert">
              {errorMessage}
            </p>
          )}
        </form>

        {isGoogleEnabled() && !google && (
          <>
            <div className="auth-divider"><span>o registrate con Google</span></div>
            <GoogleButton text="signup_with" onCredential={handleGoogleCredential} />
          </>
        )}

        <div className="register-divider" />
        <p className="register-login">
          ¿Ya tienes una cuenta? <a href="/login">Iniciar sesión</a>
        </p>
        </>
        )}
      </section>
    </main>
  )
}

export default Register
