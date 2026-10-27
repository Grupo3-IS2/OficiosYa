/** La misma regla que PasswordValidator en el backend (NIST SP 800-63B-4). */
export const MIN_PASSWORD_LENGTH = 15
export const MAX_PASSWORD_LENGTH = 128
export const PASSWORD_HINT = `Usá entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.`

export function passwordLength(password: string): number {
    return [...password.normalize('NFKC')].length
}
