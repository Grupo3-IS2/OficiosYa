import { apiRequest } from './api'

export interface UserRequest {
  name: string
  email: string
  password: string
}

export interface UserResponse {
  id: string
  name: string
  email: string
  phoneNumber: string | null
  profileImageUrl: string | null
  role: 'CLIENT' | 'PROFESSIONAL'
  createdAt: string
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

export function createUser(request: UserRequest): Promise<UserResponse> {
  return apiRequest<UserResponse>('/user/create', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function updateUser(email: string, request: Partial<UserRequest>): Promise<UserResponse> {
  return apiRequest<UserResponse>(`/user/${encodeURIComponent(email)}`, {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export async function deleteUser(email: string): Promise<void> {
  await apiRequest<void>(`/user/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  })
}

export async function changePassword(request: PasswordUpdateRequest): Promise<void> {
  await apiRequest<void>('/user/me/password', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export function changeEmail(request: EmailUpdateRequest): Promise<UserResponse> {
  return apiRequest<UserResponse>('/user/me/email', {
    method: 'PUT',
    body: JSON.stringify(request),
  })
}

export function uploadProfileImage(image: File): Promise<UserResponse> {
  const body = new FormData()
  body.append('file', image)

  return apiRequest<UserResponse>('/user/me/profile-image', {
    method: 'POST',
    body,
  })
}

export function getAuthenticatedUser(): Promise<UserResponse> {
  return apiRequest<UserResponse>('/user/me')
}
