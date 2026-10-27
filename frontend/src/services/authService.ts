import { apiRequest } from './api.ts'
import {
  PROFILE_KEY,
  TOKEN_KEY,
  USER_KEY,
  clearSession,
  getToken,
  isTokenUsable,
  storeLogin,
  notifySessionChange,
} from './session.ts'
import { keepSessionFresh } from './sessionRenewal.ts'
import type {
  AccountType,
  LoginRequest,
  LoginResponse,
  PendingVerification,
  RegisterRequest,
  RegistrationProfile,
  StoredUser,
  TokenResponse,
} from '../types/Auth.ts'
import type { ServiceArea } from '../types/Professional.ts'

/** A new login: the cached profile belonged to whoever was logged in before. */
function storeSession(response: LoginResponse): void {
  storeLogin(response)
  localStorage.removeItem(PROFILE_KEY)
  keepSessionFresh()
}

export async function login(request: LoginRequest): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(request),
  })

  storeSession(response)

  return response
}

/**
 * Starts a registration: the backend mails a code and creates nothing yet, so there is no
 * session to store. `verifyEmail` finishes it. With verification off the account is created
 * right away and its session comes back, already stored.
 */
export async function register(
  request: RegisterRequest,
  profile?: RegistrationProfile,
): Promise<PendingVerification> {
  const isProfessional = profile?.accountType === 'professional'
  const endpoint = isProfessional
    ? '/auth/register-professional'
    : '/auth/register-client'
  const body = isProfessional
    ? {
        ...request,
        phoneNumber: profile.phoneNumber,
        workingLocation: profile.location,
        serviceArea: profile.serviceArea ?? undefined,
      }
    : request

  const response = await apiRequest<PendingVerification>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (response.session) storeSession(response.session)

  return response
}

/** Creates the account once the code is right, and leaves the user logged in. */
export async function verifyEmail(email: string, code: string): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })

  storeSession(response)

  return response
}

/**
 * Logs in with the Google ID token. If the email belongs to an account with a password that
 * isn't linked to Google yet, the backend answers 409 (an `ApiError`) instead: the caller asks
 * the user whether to link it, and `googleLink` does it.
 */
export async function googleLogin(credential: string): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/google/login', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  })

  storeSession(response)

  return response
}

/** The user's "yes, link it": needs the password of the account that already has the email. */
export async function googleLink(credential: string, password: string): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/google/link', {
    method: 'POST',
    body: JSON.stringify({ credential, password }),
  })

  storeSession(response)

  return response
}

/** `name` only when the user changed the one on the Google account: without it, the backend uses Google's. */
export async function googleRegister(
  credential: string,
  accountType: AccountType,
  professional?: { phoneNumber: string; workingLocation: string; serviceArea?: ServiceArea },
  name?: string,
): Promise<LoginResponse> {
  const isProfessional = accountType === 'professional'
  const named = name ? { credential, name } : { credential }
  const response = await apiRequest<LoginResponse>(
    isProfessional ? '/auth/google/register-professional' : '/auth/google/register-client',
    {
      method: 'POST',
      body: JSON.stringify(isProfessional ? { ...named, ...professional } : named),
    },
  )

  storeSession(response)

  return response
}

export async function resendCode(email: string): Promise<PendingVerification> {
  return apiRequest<PendingVerification>('/auth/resend-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/** Same answer whether the email has an account or not; asking again is the resend. */
export async function startPasswordReset(email: string): Promise<PendingVerification> {
  return apiRequest<PendingVerification>('/auth/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/** Doesn't log in: every session of the account ends, and the new password is used from the login. */
export async function completePasswordReset(
  email: string,
  code: string,
  newPassword: string,
  newPasswordConfirmation: string,
): Promise<void> {
  await apiRequest('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword, newPasswordConfirmation }),
  })
}

export async function verifyToken(): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/auth/verify')
}

/**
 * Revokes the session on the backend before dropping it here, so a copy of a token stops working
 * too. It goes even if the access token expired: the refresh cookie says whose session it is.
 * The local session is cleared even if that call fails: the user asked to leave.
 */
export async function logout(): Promise<void> {
  try {
    await apiRequest<unknown>('/auth/logout', { method: 'POST' })
  } catch { /* already invalid or backend unreachable: clearing locally is all that is left */ }
  clearSession('/')
}

/** Follows a logout done in another tab: localStorage changes there fire `storage` here. */
export function watchSessionFromOtherTabs(): void {
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage) return
    if (event.key === TOKEN_KEY || event.key === USER_KEY || event.key === null) notifySessionChange()
    if ((event.key === TOKEN_KEY || event.key === null) && event.oldValue !== null && !getToken()) {
      window.location.href = '/login'
    }
  })
}

export function updateStoredUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.removeItem(PROFILE_KEY)
  notifySessionChange()
}

/**
 * Local check only: the token exists and has not expired. The backend has the final word. An open
 * tab renews the token before it expires (keepSessionFresh), so a live session stays authenticated.
 */
export function isAuthenticated(): boolean {
  return isTokenUsable(getToken())
}

export function getCurrentUser(): StoredUser | null {
  const storedUser = localStorage.getItem(USER_KEY)

  if (!storedUser) {
    return null
  }

  try {
    return JSON.parse(storedUser) as StoredUser
  } catch {
    return null
  }
}
