import { apiRequest } from './api'
import type { ExpertiseTrade, Trade } from '../types/Professional'

export interface UserResponse {
  id: string
  name: string
  email: string
  profileImageUrl: string | null
  role: 'CLIENT' | 'PROFESSIONAL'
  createdAt: string
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

export function getAuthenticatedUser(): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/user/me')
}

export function changeEmail(request: EmailUpdateRequest): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/user/me/email', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export async function changePassword(request: PasswordUpdateRequest): Promise<void> {
  await apiRequest<void>('/user/me/password', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export function uploadProfileImage(image: File): Promise<AuthenticatedUserResponse> {
  const body = new FormData()
  body.append('file', image)

  return apiRequest<AuthenticatedUserResponse>('/user/me/profile-image', {
    method: 'POST',
    body,
  })
}

export function updateClient(request: ClientUpdateRequest): Promise<UserResponse> {
  return apiRequest<UserResponse>('/client/me', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export function updateProfessional(request: ProfessionalUpdateRequest): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>('/professional/me', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export function getTrades(): Promise<Trade[]> {
  return apiRequest<Trade[]>('/trade')
}

export function addExpertiseTrade(tradeId: number, minimumHourlyWage: number, maximumHourlyWage: number): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>('/professional/me/expertise-trade', {
    method: 'POST',
    body: JSON.stringify({ tradeId, minimumHourlyWage, maximumHourlyWage }),
  })
}

export function removeExpertiseTrade(expertiseTradeId: number): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>(`/professional/me/expertise-trade/${expertiseTradeId}`, {
    method: 'DELETE',
  })
}

export function setProfessionalPublished(published: boolean): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>(`/professional/me/${published ? 'publish' : 'unpublish'}`, {
    method: 'POST',
  })
}

export async function deleteUser(): Promise<void> {
  await apiRequest<void>('/user/me', {
    method: 'DELETE',
  })
}
