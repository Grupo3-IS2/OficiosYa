import { clearSession, expireSession, getToken, getTokenExpiration, storeLogin } from './session.ts'
import { RENEW_MARGIN_MS, createSessionRefresher, type RefreshOutcome } from './sessionRefresher.ts'
import type { LoginResponse } from '../types/Auth.ts'

const REFRESH_URL = '/api/v1/auth/refresh'

// setTimeout overflows past this delay (~24.8 days) and would fire immediately.
const MAX_TIMEOUT_DELAY = 2 ** 31 - 1

/** How long to wait before trying again when the backend could not be reached. */
const RETRY_DELAY_MS = 30_000

const LOCK_NAME = 'oficiosya-session-refresh'

/** Web Locks are shared by every tab of the site; without them (old browsers) each tab goes on its own. */
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, task)
  }
  return task()
}

async function requestRefresh(): Promise<{ status: number; body?: LoginResponse }> {
  const response = await fetch(REFRESH_URL, { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
  const body = response.ok ? await response.json() as LoginResponse : undefined
  return { status: response.status, body }
}

const refresh = createSessionRefresher({
  requestRefresh,
  readToken: getToken,
  storeLogin: response => {
    storeLogin(response)
    keepSessionFresh()
  },
  expiresAt: getTokenExpiration,
  now: Date.now,
  exclusive,
})

/** Gets a new access token with the refresh cookie. `staleToken` is the one expiring or just rejected. */
export function renewSession(staleToken: string | null): Promise<RefreshOutcome> {
  return refresh(staleToken)
}

/** Whether the token still has time left before it should be renewed. */
export function isTokenFresh(token: string | null): boolean {
  if (!token) return false
  const expiration = getTokenExpiration(token)
  return expiration !== null && expiration - Date.now() > RENEW_MARGIN_MS
}

let timer: number | undefined

/**
 * Renews the access token a minute before it expires, so an open tab (an open chat) never loses the
 * session. If it can't be renewed the user is sent to log in, as when the token simply ran out.
 */
export function keepSessionFresh(): void {
  window.clearTimeout(timer)
  const token = getToken()
  const expiration = token ? getTokenExpiration(token) : null
  if (expiration === null) return

  const delay = Math.max(0, expiration - RENEW_MARGIN_MS - Date.now())
  if (delay > MAX_TIMEOUT_DELAY) return

  timer = window.setTimeout(async () => {
    const outcome = await renewSession(getToken())
    if (outcome === 'expired') expireSession()
    else if (outcome === 'unavailable') timer = window.setTimeout(keepSessionFresh, RETRY_DELAY_MS)
    // Also when another tab renewed it: this tab still has to schedule the next renewal
    else keepSessionFresh()
  }, delay)
}

/**
 * On page load the stored access token may have expired while the site was closed. It is renewed
 * quietly; if the session is over it is just dropped, without sending a visitor of a public page
 * to log in.
 */
export async function resumeSession(): Promise<void> {
  const token = getToken()
  if (!token) return
  if (isTokenFresh(token)) {
    keepSessionFresh()
    return
  }

  const outcome = await renewSession(token)
  if (outcome === 'expired') clearSession()
  else if (outcome === 'unavailable') keepSessionFresh()
}
