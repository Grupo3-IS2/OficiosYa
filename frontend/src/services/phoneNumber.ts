import { DEFAULT_COUNTRY, type CountryCode } from './countryCodes.ts'

/** A phone as it is edited: the country's prefix (`iso` for its flag, empty if written by hand) and the rest. */
export interface PhoneParts {
  prefix: Pick<CountryCode, 'iso' | 'dial'>
  number: string
}

/**
 * The number as it is saved: the prefix and the number written, without spaces, dashes or the 0 that starts it
 * inside the country ("099 123 456" in Uruguay is "+59899123456"). A prefix written by hand counts only for its
 * digits, and a number written whole with its "+" is kept as it is. Empty when no number is written.
 */
export function fullPhoneNumber(prefix: string, number: string): string {
  const written = number.replace(/[\s-]/g, '')
  if (!written) return ''
  if (written.startsWith('+')) return written
  return `+${prefix.replace(/\D/g, '')}${written.replace(/^0+/, '')}`
}

/**
 * A saved phone back into prefix and number, with the longest prefix of the list it starts with ("+59899123456"
 * is Uruguay and "99123456"). Without a match, or for numbers saved without a prefix ("099123456"), the prefix
 * is Uruguay's and the number stays whole, so saving it again doesn't change it.
 */
export function splitPhoneNumber(phone: string, countries: readonly CountryCode[]): PhoneParts {
  const value = phone.trim()
  const fallback = { prefix: { iso: DEFAULT_COUNTRY.iso, dial: DEFAULT_COUNTRY.dial }, number: value }
  if (!value.startsWith('+')) return fallback
  const matches = countries.filter(country => value.startsWith(country.dial))
  if (matches.length === 0) return value.startsWith(DEFAULT_COUNTRY.dial) ? { ...fallback, number: value.slice(DEFAULT_COUNTRY.dial.length) } : fallback
  const longest = Math.max(...matches.map(country => country.dial.length))
  const best = matches.find(country => country.dial.length === longest && country.iso === DEFAULT_COUNTRY.iso)
    ?? matches.find(country => country.dial.length === longest)!
  return { prefix: { iso: best.iso, dial: best.dial }, number: value.slice(best.dial.length) }
}
