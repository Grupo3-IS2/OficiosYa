import { useEffect, useRef, useState } from 'react'
import { DEFAULT_COUNTRY, flagUrl, getCountryCodes, type CountryCode } from '../../services/countryCodes'
import type { PhoneParts } from '../../services/phoneNumber'
import './PhonePrefixPicker.css'

/** The prefix chosen: `iso` says which flag to show (several countries share +1); empty when written by hand. */
export type PhonePrefix = PhoneParts['prefix']

export type Countries = { status: 'loading' } | { status: 'ready'; list: CountryCode[] } | { status: 'failed' }

// Asked once per visit: every picker shares the answer.
let countriesRequest: Promise<CountryCode[]> | null = null
function loadCountries() {
  countriesRequest ??= getCountryCodes().catch(error => { countriesRequest = null; throw error })
  return countriesRequest
}

/** The list of countries with their prefix, loaded once and shared. */
export function useCountryCodes(): Countries {
  const [countries, setCountries] = useState<Countries>({ status: 'loading' })
  useEffect(() => {
    let active = true
    loadCountries()
      .then(list => { if (active) setCountries({ status: 'ready', list }) })
      .catch(() => { if (active) setCountries({ status: 'failed' }) })
    return () => { active = false }
  }, [])
  return countries
}

/** "Perú" and "peru" alike, for the search. */
const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * The flag and prefix in front of a phone number; a tap opens every country, with a search. If the list of
 * countries can't be loaded, the prefix is just written by hand.
 */
export default function PhonePrefixPicker({ value, onChange }: Readonly<{ value: PhonePrefix; onChange: (prefix: PhonePrefix) => void }>) {
  const countries = useCountryCodes()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(event: MouseEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])

  if (countries.status === 'failed') {
    return (
      <div className="phone-prefix">
        <input className="phone-prefix__manual" aria-label="Código de país" title="No pudimos cargar la lista de países: escribí el código"
          inputMode="tel" value={value.dial} placeholder="+598" maxLength={5}
          onChange={event => onChange({ iso: '', dial: event.target.value })} />
      </div>
    )
  }

  const query = plain(search.trim())
  // Uruguay, where most people are, heads the list until something is searched.
  const shown = countries.status !== 'ready' ? []
    : query ? countries.list.filter(country => plain(country.name).includes(query) || country.dial.includes(query))
      : [...countries.list].sort((a, b) => Number(b.iso === DEFAULT_COUNTRY.iso) - Number(a.iso === DEFAULT_COUNTRY.iso))

  function choose(country: CountryCode) {
    onChange({ iso: country.iso, dial: country.dial })
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="phone-prefix" ref={container}>
      <button type="button" className="phone-prefix__trigger" aria-label={`Código de país: ${value.dial}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
        {value.iso && <img src={flagUrl(value.iso)} alt="" width="20" height="15" />}
        <span>{value.dial}</span>
      </button>
      {open && (
        <div className="phone-prefix__menu">
          <input type="search" aria-label="Buscar país" placeholder="Buscar país o código" value={search} autoFocus onChange={event => setSearch(event.target.value)} />
          {countries.status === 'loading' ? <output>Cargando países…</output> : (
            <div role="listbox" aria-label="Países">
              {shown.length === 0 && <p>No encontramos ese país.</p>}
              {shown.map(country => (
                <button key={country.iso} type="button" role="option" aria-selected={country.iso === value.iso} onClick={() => choose(country)}>
                  <img src={flagUrl(country.iso)} alt="" width="20" height="15" loading="lazy" />
                  <span>{country.name}</span>
                  <small>{country.dial}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
