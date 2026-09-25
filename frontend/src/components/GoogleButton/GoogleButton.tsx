import { useEffect, useRef, useState } from 'react'
import { getGoogleClientId, loadGoogleIdentity, renderGoogleButton } from '../../services/googleIdentity'
import './GoogleButton.css'

interface GoogleButtonProps {
  text: 'signin_with' | 'signup_with' | 'continue_with'
  /** Called with the Google ID token once the user picks an account. */
  onCredential: (credential: string) => void
}

/** Renders nothing when Google sign-in isn't configured, so the rest of the page works without it. */
function GoogleButton({ text, onCredential }: GoogleButtonProps) {
  const clientId = getGoogleClientId()
  const container = useRef<HTMLDivElement>(null)
  // The callback Google keeps is set once: this always points at the latest `onCredential`.
  const latestCallback = useRef(onCredential)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    latestCallback.current = onCredential
  })

  useEffect(() => {
    const element = container.current
    if (!clientId || !element) return

    let active = true

    loadGoogleIdentity()
      .then((google) => {
        if (!active) return
        renderGoogleButton(
          google,
          clientId,
          element,
          {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text,
            shape: 'rectangular',
            locale: 'es',
            width: Math.min(400, Math.max(200, Math.floor(element.clientWidth))),
          },
          (credential) => latestCallback.current(credential),
        )
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
      element.replaceChildren()
    }
  }, [clientId, text])

  if (!clientId) return null

  if (failed) {
    return (
      <output className="google-button-error">
        No pudimos cargar el acceso con Google. Probá de nuevo más tarde o usá tu correo y contraseña.
      </output>
    )
  }

  return <div ref={container} className="google-button" />
}

export default GoogleButton
