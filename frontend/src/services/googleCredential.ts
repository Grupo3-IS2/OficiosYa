/**
 * The email inside a Google ID token, only to tell the user which account it is about.
 * The signature is not checked: this is display text, the backend verifies the token.
 */
export function emailFromCredential(credential: string): string | null {
  const payload = credential.split('.')[1]
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    const { email } = JSON.parse(new TextDecoder().decode(bytes)) as { email?: unknown }
    return typeof email === 'string' && email !== '' ? email : null
  } catch {
    return null
  }
}
