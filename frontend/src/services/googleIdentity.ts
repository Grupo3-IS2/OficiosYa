/**
 * Google Identity Services: the script that draws the "Continuar con Google" button and hands
 * back an ID token (`credential`) for the backend to verify. Loaded on demand, only where a
 * button is shown.
 */

const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

export interface GoogleButtonConfig {
  type: 'standard'
  theme: 'outline'
  size: 'large'
  text: 'signin_with' | 'signup_with' | 'continue_with'
  shape: 'rectangular'
  locale: string
  /** Pixels, 200 to 400: Google draws the button at a fixed width. */
  width: number
}

export interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: { credential: string }) => void
  }): void
  renderButton(element: HTMLElement, config: GoogleButtonConfig): void
}

/** The OAuth Client ID the button is set up with; null when Google sign-in isn't configured. */
export function getGoogleClientId(): string | null {
  const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined
  return clientId?.trim() || null
}

export function isGoogleEnabled(): boolean {
  return getGoogleClientId() !== null
}

function readGlobal(): GoogleAccountsId | undefined {
  return (window as unknown as { google?: { accounts?: { id?: GoogleAccountsId } } }).google?.accounts?.id
}

/**
 * Google keeps a single callback, the one from the last `initialize`, and warns if it is called
 * again. So it is initialized once, and the callback it holds hands the token to whichever
 * button was rendered last.
 */
let initializedFor: string | null = null
let activeCallback: ((credential: string) => void) | null = null

export function renderGoogleButton(
  google: GoogleAccountsId,
  clientId: string,
  element: HTMLElement,
  config: GoogleButtonConfig,
  onCredential: (credential: string) => void,
): void {
  activeCallback = onCredential

  if (initializedFor !== clientId) {
    google.initialize({
      client_id: clientId,
      callback: (response) => activeCallback?.(response.credential),
    })
    initializedFor = clientId
  }

  google.renderButton(element, config)
}

let loading: Promise<GoogleAccountsId> | null = null

export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  const ready = readGlobal()
  if (ready) return Promise.resolve(ready)
  if (loading) return loading

  loading = new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => {
      const loaded = readGlobal()
      if (loaded) {
        resolve(loaded)
      } else {
        loading = null
        reject(new Error('Google Identity Services no está disponible.'))
      }
    }
    script.onerror = () => {
      // Allow another try later (ad blocker turned off, connection back).
      script.remove()
      loading = null
      reject(new Error('No se pudo cargar Google Identity Services.'))
    }
    document.head.appendChild(script)
  })

  return loading
}
