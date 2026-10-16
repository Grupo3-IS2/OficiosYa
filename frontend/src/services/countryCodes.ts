/** A country to choose the phone's prefix from: its two-letter code (for the flag), Spanish name and prefix. */
export interface CountryCode {
  iso: string
  name: string
  dial: string
}

/** Until the list arrives, and when it can't be had: the prefix starts as Uruguay's. */
export const DEFAULT_COUNTRY: CountryCode = { iso: 'uy', name: 'Uruguay', dial: '+598' }

/**
 * The countries come from the "world-countries" data on jsDelivr: public, no key, open to browsers. The version
 * is fixed, so the file never changes under the page and browsers keep it cached.
 */
const COUNTRIES_URL = 'https://cdn.jsdelivr.net/npm/world-countries@5.1.0/dist/countries.json'

/** The flag of a country, from flagcdn (also public, no key). */
export const flagUrl = (iso: string) => `https://flagcdn.com/${iso}.svg`

interface RawCountry {
  cca2?: unknown
  name?: { common?: unknown }
  translations?: { spa?: { common?: unknown } }
  idd?: { root?: unknown; suffixes?: unknown }
}

/**
 * The prefix out of the data's "root" and "suffixes": one suffix completes it (+5 and 98 is +598); many are area
 * codes under one prefix (+1 and 201, 202… is +1; same for +7). Elsewhere the shortest one is the country's.
 */
function dialOf(root: string, suffixes: string[]): string {
  let dial = root
  if (suffixes.length === 1) dial = root + suffixes[0]
  else if (suffixes.length > 1 && root !== '+1' && root !== '+7') dial = root + [...suffixes].sort((a, b) => a.length - b.length)[0]
  // No prefix is longer than "+1268": a longer one carries an area code too (Åland's "+35818" is +358).
  return dial.length > 5 ? dial.slice(0, 4) : dial
}

/** The countries in the data that have a prefix, by name in Spanish. Anything malformed is left out. */
export function parseCountryCodes(data: unknown): CountryCode[] {
  if (!Array.isArray(data)) return []
  const countries: CountryCode[] = []
  for (const raw of data as RawCountry[]) {
    const root = raw.idd?.root
    const suffixes = Array.isArray(raw.idd?.suffixes) ? raw.idd.suffixes.filter((s): s is string => typeof s === 'string') : []
    const name = raw.translations?.spa?.common ?? raw.name?.common
    if (typeof raw.cca2 !== 'string' || typeof root !== 'string' || !root || typeof name !== 'string') continue
    countries.push({ iso: raw.cca2.toLowerCase(), name, dial: dialOf(root, suffixes) })
  }
  return countries.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export async function getCountryCodes(fetchFn: typeof fetch = fetch): Promise<CountryCode[]> {
  const response = await fetchFn(COUNTRIES_URL)
  if (!response.ok) throw new Error(`countries ${response.status}`)
  const countries = parseCountryCodes(await response.json())
  if (countries.length === 0) throw new Error('countries: empty list')
  return countries
}
