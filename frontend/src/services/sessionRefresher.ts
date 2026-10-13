import type { LoginResponse } from '../types/Auth'

/**
 * - `refreshed`: there is a fresh access token stored (this call got it, or another tab did).
 * - `expired`: the refresh token is gone or dead, the user has to log in again.
 * - `unavailable`: the backend could not be reached; the session may still be alive.
 */
export type RefreshOutcome = 'refreshed' | 'expired' | 'unavailable'

/** An access token with less than this left is renewed before it is used. */
export const RENEW_MARGIN_MS = 60_000

export interface SessionRefresherDeps {
  /** POST /auth/refresh; the browser sends the HttpOnly refresh cookie on its own. Rejects if offline. */
  requestRefresh: () => Promise<{ status: number; body?: LoginResponse }>
  readToken: () => string | null
  storeLogin: (response: LoginResponse) => void
  /** The token's `exp`, in milliseconds. */
  expiresAt: (token: string) => number | null
  now: () => number
  /** Runs the task while no other tab runs it, so two tabs never spend the same refresh token. */
  exclusive: <T>(task: () => Promise<T>) => Promise<T>
}

/**
 * Builds the function that renews the access token. Each refresh token works once, so every
 * caller of a tab shares one request, and tabs take turns: whoever comes second finds the token
 * the first one stored and doesn't ask again.
 */
export function createSessionRefresher(deps: SessionRefresherDeps): (staleToken: string | null) => Promise<RefreshOutcome> {
  let inFlight: Promise<RefreshOutcome> | null = null

  function isFresh(token: string | null): boolean {
    if (!token) return false
    const expiration = deps.expiresAt(token)
    return expiration !== null && expiration - deps.now() > RENEW_MARGIN_MS
  }

  /** Someone else already replaced the token this call wanted to renew. */
  function renewedElsewhere(staleToken: string | null): boolean {
    const current = deps.readToken()
    return current !== staleToken && isFresh(current)
  }

  async function renew(staleToken: string | null): Promise<RefreshOutcome> {
    return deps.exclusive(async () => {
      if (renewedElsewhere(staleToken)) return 'refreshed'

      let response: { status: number; body?: LoginResponse }
      try {
        response = await deps.requestRefresh()
      } catch {
        return 'unavailable'
      }

      if (response.status === 200 && response.body) {
        deps.storeLogin(response.body)
        return 'refreshed'
      }
      if (response.status === 401 || response.status === 403) {
        // Without Web Locks another tab may have won the race: then its token is the good one
        return renewedElsewhere(staleToken) ? 'refreshed' : 'expired'
      }
      return 'unavailable'
    })
  }

  /** `staleToken` is the token that is expiring or was just rejected (null if there was none). */
  return staleToken => {
    inFlight ??= renew(staleToken).finally(() => { inFlight = null })
    return inFlight
  }
}
