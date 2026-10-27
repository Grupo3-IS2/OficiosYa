import { apiRequest } from './api'
import { clearSession } from './session'
import type { PendingVerification } from '../types/Auth'
import type { ExpertiseTrade, ServiceArea, Trade } from '../types/Professional'

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
  /** Whether the user gets emails about their requests (a change of timeframe, requests piling up). */
  emailNotifications: boolean
}

export interface ProfessionalResponse extends UserResponse {
  role: 'PROFESSIONAL'
  phoneNumber: string
  workingLocation: string
  serviceArea: ServiceArea | null
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

export interface ProfessionalUpdateRequest extends UserUpdateRequest {
  phoneNumber?: string
  workingLocation?: string
  serviceArea?: ServiceArea
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

/** Turns the emails about the user's requests on or off; it takes effect right away. */
export function updateNotifications(emailNotifications: boolean): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me/notifications', {
    method: 'PUT',
    body: JSON.stringify({ emailNotifications }),
  })
}

export function getAuthenticatedUser(): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me')
}

/**
 * First step of changing the email: mails a code to the NEW address and changes nothing yet.
 * `verifyEmailChange` finishes it.
 */
export function startEmailChange(request: EmailUpdateRequest): Promise<PendingVerification> {
  return apiRequest<PendingVerification>('/users/me/email', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

/** Second step: the code that reached the new address; the email changes and the user comes back updated. */
export function verifyEmailChange(newEmail: string, code: string): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me/email/verify', {
    method: 'POST',
    body: JSON.stringify({ email: newEmail, code }),
  })
}

export function resendEmailChangeCode(newEmail: string): Promise<PendingVerification> {
  return apiRequest<PendingVerification>('/users/me/email/resend', {
    method: 'POST',
    body: JSON.stringify({ email: newEmail }),
  })
}

/** For an account created with Google: mails a code to its email to give it a password. Called again, it resends. */
export function startPasswordSetup(): Promise<PendingVerification> {
  return apiRequest<PendingVerification>('/users/me/password/setup', { method: 'POST' })
}

/** The code and the new password: the account gets it, and comes back with `hasPassword` on. */
export function completePasswordSetup(code: string, newPassword: string, newPasswordConfirmation: string): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me/password/setup', {
    method: 'PUT',
    body: JSON.stringify({ code, newPassword, newPasswordConfirmation }),
  })
}

export async function changePassword(request: PasswordUpdateRequest): Promise<void> {
  await apiRequest<void>('/users/me/password', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

/** Back to no photo. */
export function removeProfileImage(): Promise<AuthenticatedUserResponse> {
  return apiRequest<AuthenticatedUserResponse>('/users/me/profile-image', { method: 'DELETE' })
}

export function uploadProfileImage(image: File): Promise<AuthenticatedUserResponse> {
  const body = new FormData()
  body.append('file', image)

  return apiRequest<AuthenticatedUserResponse>('/users/me/profile-image', {
    method: 'POST',
    body,
  })
}

export function updateUser(request: UserUpdateRequest): Promise<UserResponse> {
  return apiRequest<UserResponse>('/users/me', {
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

/** Mails the code that deleting the account asks for. Called again, it resends. */
export function startAccountDeletion(): Promise<PendingVerification> {
  return apiRequest<PendingVerification>('/users/me/deletion-code', { method: 'POST' })
}

/**
 * Deletes the account, confirmed with the current password or, for an account created with Google, its
 * email, and the code mailed to it. Every session of the user ends; this one is cleared here too.
 */
export async function deleteUser(confirmation: { currentPassword?: string; email?: string; code: string }): Promise<void> {
  await apiRequest<void>('/users/me', {
    method: 'DELETE',
    body: JSON.stringify(confirmation),
  })
  clearSession('/')
}
