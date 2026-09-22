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
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegistrationProfile,
  StoredUser,
  TokenResponse,
} from '../types/Auth'

// setTimeout overflows past this delay (~24.8 days) and would fire immediately.
const MAX_TIMEOUT_DELAY = 2 ** 31 - 1

export async function login(request: LoginRequest): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(request),
  })

  localStorage.setItem(TOKEN_KEY, response.token)
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: response.id,
    email: response.email,
    name: response.name,
    role: response.role,
  }))
  localStorage.removeItem(PROFILE_KEY)

  return response
}

export async function register(
  request: RegisterRequest,
  profile?: RegistrationProfile,
): Promise<LoginResponse> {
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

  const response = await apiRequest<LoginResponse>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  })

  localStorage.setItem(TOKEN_KEY, response.token)
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: response.id,
    email: response.email,
    name: response.name,
    role: response.role,
  }))

  localStorage.removeItem(PROFILE_KEY)

  return response
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
