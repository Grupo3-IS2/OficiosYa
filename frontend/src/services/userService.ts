import { apiRequest } from './api'
import type { ExpertiseTrade, Trade } from '../types/Professional'

export interface UserResponse {
  id: string
  name: string
  email: string
  profileImageUrl: string | null
  role: 'CLIENT' | 'PROFESSIONAL'
  createdAt: string
  /** False for an account created with Google: there is no password to change or confirm with. */
  hasPassword: boolean
  /** Whether a Google account is linked to this one. */
  googleLinked: boolean
}

export interface ProfessionalResponse extends UserResponse {
  role: 'PROFESSIONAL'
  phoneNumber: string
  workingLocation: string
  description: string | null
  published: boolean
  expertiseTrades: ExpertiseTrade[]
}

export type AuthenticatedUserResponse = UserResponse | ProfessionalResponse

export function isProfessionalResponse(
  user: AuthenticatedUserResponse,
): user is ProfessionalResponse {
  return user.role === 'PROFESSIONAL'
}

export interface UserUpdateRequest {
  name?: string
}

export type ClientUpdateRequest = UserUpdateRequest

export interface ProfessionalUpdateRequest extends UserUpdateRequest {
  phoneNumber?: string
  workingLocation?: string
  description?: string
}

export interface PasswordUpdateRequest {
  oldPassword: string
  newPassword: string
  newPasswordConfirmation: string
}

export interface EmailUpdateRequest {
  newEmail: string
  currentPassword: string
}

export function linkGoogle(credential: string, currentPassword: string): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me/google', {
    method: 'PUT',
    body: JSON.stringify({ credential, currentPassword }),
  })
}

export function unlinkGoogle(currentPassword: string): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me/google', {
    method: 'DELETE',
    body: JSON.stringify({ currentPassword }),
  })
}

export function getAuthenticatedUser(): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me')
}

export function changeEmail(request: EmailUpdateRequest): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me/email', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export async function changePassword(request: PasswordUpdateRequest): Promise<void> {
  await apiRequest<void>('/users/me/password', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export function uploadProfileImage(image: File): Promise<AuthenticatedUserResponse> {
  const body = new FormData()
  body.append('file', image)

  return apiRequest<AuthenticatedUserResponse>('/users/me/profile-image', {
    method: 'POST',
    body,
  })
}

export function updateClient(request: ClientUpdateRequest): Promise<UserResponse> {
  return apiRequest<UserResponse>('/clients/me', {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export function updateProfessional(request: ProfessionalUpdateRequest): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>('/professionals/me', {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export function getTrades(): Promise<Trade[]> {
  return apiRequest<Trade[]>('/trades')
}

export function addExpertiseTrade(tradeId: number, minimumHourlyWage: number, maximumHourlyWage: number): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>('/professionals/me/expertise-trades', {
    method: 'POST',
    body: JSON.stringify({ tradeId, minimumHourlyWage, maximumHourlyWage }),
  })
}

export function updateExpertiseTrade(expertiseTradeId: number, minimumHourlyWage: number, maximumHourlyWage: number): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>(`/professionals/me/expertise-trades/${expertiseTradeId}`, {
    method: 'PATCH',
    body: JSON.stringify({ minimumHourlyWage, maximumHourlyWage }),
  })
}

export function removeExpertiseTrade(expertiseTradeId: number): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>(`/professionals/me/expertise-trades/${expertiseTradeId}`, {
    method: 'DELETE',
  })
}

export function setProfessionalPublished(published: boolean): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>(`/professionals/me/${published ? 'publish' : 'unpublish'}`, {
    method: 'POST',
  })
}

export async function deleteUser(): Promise<void> {
  await apiRequest<void>('/users/me', {
    method: 'DELETE',
  })
}
