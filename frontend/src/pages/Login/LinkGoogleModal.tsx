import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import './LinkGoogleModal.css'

interface LinkGoogleModalProps {
  /** The email of the Google account, when the token carries it. */
  email: string | null
  /** Links Google with the password given and logs in; throws with the message to show if it fails. */
  onLink: (password: string) => Promise<void>
  onCancel: () => void
}

/**
 * Shown when someone signs in with Google and that email already has an account with a
 * password. Linking is their call: nothing is linked unless they confirm with the password.
 */
function LinkGoogleModal({ email, onLink, onCancel }: LinkGoogleModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [password, setPassword] = useState('')
  const [isLinking, setIsLinking] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const element = dialog.current!
    const previousOverflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setIsLinking(true)

    try {
      await onLink(password)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo vincular la cuenta. Intentá nuevamente.',
      )
      setIsLinking(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="link-google-modal"
      aria-labelledby="link-google-title"
      aria-describedby="link-google-description"
      aria-busy={isLinking}
      onCancel={(event) => {
        event.preventDefault()
        if (!isLinking) onCancel()
      }}
    >
      <form className="link-google-modal__body" onSubmit={handleSubmit}>
        <h2 id="link-google-title">Ya tenés una cuenta con este correo</h2>
        <p id="link-google-description">
          Encontramos una cuenta de OficiosYa con {email ? <strong>{email}</strong> : 'ese correo'}.
          ¿Querés vincularla con tu cuenta de Google para entrar más rápido?
          Confirmá tu contraseña para hacerlo.
        </p>

        <label htmlFor="link-google-password">Contraseña de OficiosYa</label>
        <input
          id="link-google-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />

        {errorMessage && (
          <p className="link-google-modal__error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="link-google-modal__actions">
          <Button type="submit" disabled={isLinking || password === ''}>
            {isLinking ? 'Vinculando...' : 'Vincular y entrar'}
          </Button>
          <button type="button" disabled={isLinking} onClick={onCancel}>
            No, gracias
          </button>
        </div>
        <small>Si elegís no vincularla, seguís entrando con tu correo y contraseña.</small>
      </form>
    </dialog>,
    document.body,
  )
}

export default LinkGoogleModal
