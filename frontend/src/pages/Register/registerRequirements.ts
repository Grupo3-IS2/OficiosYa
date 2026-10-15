import type { AccountType } from '../../types/Auth'

const PHONE = /^(\+\d{1,3})?\d{9}$/

/** What the form still needs before the account can be made (with a password or with Google), as things to do. Empty: ready. */
export function missingToRegister(accountType: AccountType, phoneNumber: string, location: string, acceptedTerms: boolean): string[] {
  const missing: string[] = []
  if (accountType === 'professional') {
    if (!phoneNumber.trim()) missing.push('ingresá tu teléfono')
    else if (!PHONE.test(phoneNumber.trim())) missing.push('ingresá un número de teléfono válido, sin el código del país')
    if (!location.trim()) missing.push('ingresá tu ubicación')
  }
  if (!acceptedTerms) missing.push('aceptá los términos y condiciones')
  return missing
}

/** "a", "a y b", "a, b y c". */
export function joinSpanish(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}
