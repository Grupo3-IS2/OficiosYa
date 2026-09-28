export const TOKEN_KEY = 'oficiosya_token'
export const USER_KEY = 'oficiosya_user'
export const PROFILE_KEY = 'oficiosya_profile'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(PROFILE_KEY)
}

/**
 * Reads `exp` from the JWT payload, in milliseconds. The signature is not checked:
 * this only spares the user a round trip, the backend still decides if the token is valid.
 */
export function getTokenExpiration(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const { exp } = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export function isTokenUsable(token: string | null): boolean {
  if (!token) return false
  const expiration = getTokenExpiration(token)
  return expiration !== null && expiration > Date.now()
}

/** Drops the dead session and sends the user to log in again, telling them why. */
export function expireSession(): void {
  clearSession()
  window.location.href = '/login?expired=1'
}
