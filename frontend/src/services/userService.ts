import { apiRequest } from './api'

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

export function updateClient(id: string, request: ClientUpdateRequest): Promise<UserResponse> {
  return apiRequest<UserResponse>(`/client/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export function updateProfessional(
  id: string,
  request: ProfessionalUpdateRequest,
): Promise<ProfessionalResponse> {
  return apiRequest<ProfessionalResponse>(`/professional/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export async function deleteUser(id: string): Promise<void> {
  await apiRequest<void>(`/user/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
