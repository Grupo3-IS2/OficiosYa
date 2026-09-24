import { apiRequest } from './api'
import {
  PROFILE_KEY,
  TOKEN_KEY,
  USER_KEY,
  clearSession,
  expireSession,
  getToken,
  getTokenExpiration,
  isTokenUsable,
} from './session'
import type {
  AccountType,
  LoginRequest,
  LoginResponse,
  PendingVerification,
  RegisterRequest,
  RegistrationProfile,
  StoredUser,
  TokenResponse,
} from '../types/Auth'

// setTimeout overflows past this delay (~24.8 days) and would fire immediately.
const MAX_TIMEOUT_DELAY = 2 ** 31 - 1

function storeSession(response: LoginResponse): void {
  localStorage.setItem(TOKEN_KEY, response.token)
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: response.id,
    email: response.email,
    name: response.name,
    role: response.role,
  }))
  localStorage.removeItem(PROFILE_KEY)
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
 * session to store. `verifyEmail` finishes it.
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
      }
    : request

  return apiRequest<PendingVerification>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  })
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

export async function googleRegister(
  credential: string,
  accountType: AccountType,
  professional?: { phoneNumber: string; workingLocation: string },
): Promise<LoginResponse> {
  const isProfessional = accountType === 'professional'
  const response = await apiRequest<LoginResponse>(
    isProfessional ? '/auth/google/register-professional' : '/auth/google/register-client',
    {
      method: 'POST',
      body: JSON.stringify(isProfessional ? { credential, ...professional } : { credential }),
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

export async function verifyToken(): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/auth/verify')
}

export function logout(): void {
  clearSession()
}

/** Ends the session on its own when the token expires, even if the tab is left open. */
export function scheduleSessionExpiry(): void {
  const token = getToken()
  if (!isTokenUsable(token)) return

  const delay = getTokenExpiration(token!)! - Date.now()
  if (delay <= MAX_TIMEOUT_DELAY) {
    window.setTimeout(expireSession, delay)
  }
}

export function updateStoredUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.removeItem(PROFILE_KEY)
}

/** Local check only: the token exists and has not expired. The backend has the final word. */
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
