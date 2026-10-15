/** Who a Google ID token is about, as far as the page needs to show it. */
export interface GoogleProfile {
  email: string
  /** The name on the Google account; empty if the account doesn't share one. */
  name: string
  /** When the token stops being accepted, in milliseconds (like Date.now()); null if it doesn't say. */
  expiresAt: number | null
}

/**
 * The data inside a Google ID token, only to fill in and show to the user.
 * The signature is not checked: the backend verifies the token when it is sent.
 */
export function profileFromCredential(credential: string): GoogleProfile | null {
  const payload = credential.split('.')[1]
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    const { email, name, exp } = JSON.parse(new TextDecoder().decode(bytes)) as { email?: unknown; name?: unknown; exp?: unknown }
    if (typeof email !== 'string' || email === '') return null
    return {
      email,
      name: typeof name === 'string' ? name.trim() : '',
      expiresAt: typeof exp === 'number' ? exp * 1000 : null,
    }
  } catch {
    return null
  }
}

/** The email inside a Google ID token, only to tell the user which account it is about. */
export function emailFromCredential(credential: string): string | null {
  return profileFromCredential(credential)?.email ?? null
}

const SIGNUP_KEY = 'oficiosya_google_signup'

/**
 * Login got a Google account that has no OficiosYa account: the token goes to the sign-up page, which fills
 * itself with it. It is kept for this tab only, and not in the address, where it would stay in the history.
 */
export function handOverGoogleSignup(credential: string): void {
  try {
    sessionStorage.setItem(SIGNUP_KEY, credential)
  } catch {
    // Without storage the sign-up page just opens empty, and Google can be picked again there.
  }
}

/** The token handed over by login, if there is one; it is taken only once. */
export function takeGoogleSignup(): string | null {
  try {
    const credential = sessionStorage.getItem(SIGNUP_KEY)
    sessionStorage.removeItem(SIGNUP_KEY)
    return credential
  } catch {
    return null
  }
}
