const API_BASE_URL = '/api/v1'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const DEFAULT_ERROR_MESSAGE = 'Ocurrió un error al comunicarse con el servidor.'

/**
 * Validation errors come as { error: 'Error de validación', details: { field: message } }:
 * the per-field messages say what is wrong, so they win over the generic error.
 */
function errorMessageFrom(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    return DEFAULT_ERROR_MESSAGE
  }

  const { message, error, details } = body as Record<string, unknown>

  if (typeof details === 'object' && details !== null) {
    const fieldMessages = Object.values(details).map(String)
    if (fieldMessages.length > 0) {
      return fieldMessages.join('\n')
    }
  }

  if (message != null) return String(message)
  if (error != null) return String(error)
  return DEFAULT_ERROR_MESSAGE
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('oficiosya_token')
  const headers = new Headers(options.headers)

  // The browser has to set the multipart Content-Type itself, boundary included.
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    throw new ApiError(errorMessageFrom(body), response.status)
  }

  return body as T
}
