import { apiRequest } from './api'

export interface UserRequest {
  name: string
  email: string
  password: string
}

export interface UserResponse {
  id: number
  name: string
  email: string
  salary: number | null
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
