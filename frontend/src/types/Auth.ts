export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest extends LoginRequest {
  name: string
}

export type AccountType = 'client' | 'professional'

export interface RegistrationProfile {
  email: string
  accountType: AccountType
  location: string | null
  phoneNumber: string | null
}

export interface StoredUser {
  /** El publicId: es lo que identifica al usuario en la API, no el correo. */
  id: string
  email: string
  name: string
  role?: 'CLIENT' | 'PROFESSIONAL'
}

export interface LoginResponse {
  id: string
  token: string
  email: string
  name: string
  role: 'CLIENT' | 'PROFESSIONAL'
  message: string
}

export interface TokenResponse {
  verified: boolean
  emittedDate: string | null
  expirationDate: string | null
}
