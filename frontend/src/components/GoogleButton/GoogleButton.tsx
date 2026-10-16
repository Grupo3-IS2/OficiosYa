import { useEffect, useRef, useState } from 'react'
import { getGoogleClientId, loadGoogleIdentity, renderGoogleButton } from '../../services/googleIdentity'
import './GoogleButton.css'

interface GoogleButtonProps {
  text: 'signin_with' | 'signup_with' | 'continue_with'
  /** Called with the Google ID token once the user picks an account. */
  onCredential: (credential: string) => void
}

function whenGoogleSettles(element: HTMLElement, done: () => void) {
  let finished = false
  let iframeLoaded = false
  let quietTimer: ReturnType<typeof setTimeout> | undefined
  const watched = new WeakSet<HTMLIFrameElement>()

  const finish = () => {
    if (finished) return
    finished = true
    observer.disconnect()
    clearTimeout(quietTimer)
    clearTimeout(maxTimer)
    done()
  }

  const schedule = () => {
    clearTimeout(quietTimer)
    if (iframeLoaded) quietTimer = setTimeout(finish, 400)
  }

  const watchIframe = () => {
    const iframe = element.querySelector('iframe')
    if (!iframe || watched.has(iframe)) return
    watched.add(iframe)
    iframe.addEventListener('load', () => {
      iframeLoaded = true
      schedule()
    })
  }

  const observer = new MutationObserver(() => {
    watchIframe()
    schedule()
  })
  observer.observe(element, { childList: true, subtree: true, attributes: true })
  watchIframe()

  const maxTimer = setTimeout(finish, 2500)

  return () => {
    finished = true
    observer.disconnect()
    clearTimeout(quietTimer)
    clearTimeout(maxTimer)
  }
}

/** Renders nothing when Google sign-in isn't configured, so the rest of the page works without it. */
function GoogleButton({ text, onCredential }: GoogleButtonProps) {
  const clientId = getGoogleClientId()
  const container = useRef<HTMLDivElement>(null)
  // The callback Google keeps is set once: this always points at the latest `onCredential`.
  const latestCallback = useRef(onCredential)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    latestCallback.current = onCredential
  })

  useEffect(() => {
    const element = container.current
    if (!clientId || !element) return

    let active = true
    let stopWatching = () => {}
    setReady(false)

    loadGoogleIdentity()
      .then((google) => {
        if (!active) return
        stopWatching = whenGoogleSettles(element, () => {
          if (active) setReady(true)
        })
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
      stopWatching()
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

  return <div ref={container} className="google-button" data-ready={ready} aria-busy={!ready} />
}

export default GoogleButton