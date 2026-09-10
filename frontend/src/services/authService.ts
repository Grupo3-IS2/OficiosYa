import { apiRequest } from './api'
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegistrationProfile,
  StoredUser,
  TokenResponse,
} from '../types/Auth'

const TOKEN_KEY = 'oficiosya_token'
const USER_KEY = 'oficiosya_user'
const PROFILE_KEY = 'oficiosya_profile'

export async function login(request: LoginRequest): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(request),
  })

  localStorage.setItem(TOKEN_KEY, response.token)
  localStorage.setItem(USER_KEY, JSON.stringify({
    email: response.email,
    name: response.name,
  }))

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
    email: response.email,
    name: response.name,
  }))

  if (profile) {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ ...profile, email: response.email }),
    )
  }

  return response
}

export async function verifyToken(): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/auth/verify')
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function updateStoredUser(user: StoredUser): void {
  const profile = getRegistrationProfile()
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  if (profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, email: user.email }))
  }
}

export function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY))
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

export function getRegistrationProfile(): RegistrationProfile | null {
  const currentUser = getCurrentUser()
  const storedProfile = localStorage.getItem(PROFILE_KEY)

  if (!currentUser || !storedProfile) {
    return null
  }

  try {
    const profile = JSON.parse(storedProfile) as RegistrationProfile
    return profile.email === currentUser.email ? profile : null
  } catch {
    return null
  }
}
