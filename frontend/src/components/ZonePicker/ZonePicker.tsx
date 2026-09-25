import { useEffect, useRef, useState } from 'react'
import { lookupBestZone, reverseZone, reverseZoomFor, sharedZoneCache, suggestZones, type ZoneChoice } from '../../services/zoneMap'
import ZoneMap, { type MapFocus } from '../ZoneMap/ZoneMap'
import './ZonePicker.css'

interface ZonePickerProps {
  /** What is written in the location field: it is the search, and what ends up saved. */
  query: string
  /** The zone chosen, as the short name to keep in the field. */
  onChoose: (label: string) => void
  /**
   * For a form that opens with a zone already saved: puts the map on it. Once, the first time the field has
   * a value (it may arrive after the form is drawn); what is typed afterwards is suggested as usual.
   */
  locateSaved?: boolean
}

/** Tapping the map: what is being asked and how it went. */
type Status = 'idle' | 'searching' | 'error' | 'outside'
/** Suggesting while typing. */
type Suggesting = 'idle' | 'loading' | 'none' | 'error'

/** How long to wait after the last key before asking, and how much has to be written: the search service is shared. */
const SUGGEST_DELAY_MS = 400
const MIN_LETTERS = 3

/**
 * The map under the location field. While the field is typed in, places that match are suggested (from
 * Photon, which is made for it); picking one, or tapping the map, puts its name in the field. It doesn't
 * replace typing the zone by hand, it helps to find it.
 */
function ZonePicker({ query, onChoose, locateSaved = false }: Readonly<ZonePickerProps>) {
  const [choices, setChoices] = useState<ZoneChoice[]>([])
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [suggesting, setSuggesting] = useState<Suggesting>('idle')
  const located = useRef(false)
  /** The text that came from a choice or the saved zone: it is not something typed, so it isn't searched. */
  const settled = useRef('')

  useEffect(() => {
    if (!locateSaved || located.current || !query.trim()) return
    located.current = true
    settled.current = query.trim()

    lookupBestZone(query, { cache: sharedZoneCache() })
      .then(place => { if (place) setFocus(place) })
      .catch(() => { /* the map just stays on the country: the zone is still written in the field */ })
  }, [locateSaved, query])

  useEffect(() => {
    const text = query.trim()
    if (text === settled.current) return
    const search = new AbortController()
    const tooShort = text.length < MIN_LETTERS
    const timer = setTimeout(async () => {
      if (tooShort) {
        setChoices([])
        setSuggesting('idle')
        return
      }
      setSuggesting('loading')
      try {
        const found = await suggestZones(text, { signal: search.signal })
        if (search.signal.aborted) return
        setChoices(found)
        setSuggesting(found.length === 0 ? 'none' : 'idle')
      } catch {
        // Typing on cancels the search that was on its way: that is not an error.
        if (search.signal.aborted) return
        setChoices([])
        setSuggesting('error')
      }
    }, tooShort ? 0 : SUGGEST_DELAY_MS)

    return () => {
      clearTimeout(timer)
      search.abort()
    }
  }, [query])

  function choose(choice: ZoneChoice) {
    settled.current = choice.label
    onChoose(choice.label)
    setFocus({ lat: choice.lat, lon: choice.lon, bbox: choice.bbox })
    setChoices([])
    setSuggesting('idle')
    setStatus('idle')
  }

  async function pick(lat: number, lon: number, mapZoom: number) {
    // One question at a time: taps while one is being answered are dropped.
    if (status === 'searching') return
    setFocus({ lat, lon })
    setStatus('searching')
    try {
      const zone = await reverseZone(lat, lon, { zoom: reverseZoomFor(mapZoom) })
      if (zone) {
        settled.current = zone.label
        onChoose(zone.label)
        setChoices([])
        setSuggesting('idle')
        setStatus('idle')
      } else {
        setStatus('outside')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="zone-picker">
      {choices.length > 0 && (
        <ul className="zone-picker__choices" aria-label="Lugares encontrados">
          {choices.map(choice => (
            <li key={`${choice.lat},${choice.lon}`}>
              <button type="button" onClick={() => choose(choice)}>
                <strong>{choice.label}</strong>
                {choice.details !== choice.label && <small>{choice.details}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ZoneMap focus={focus} onPick={(lat, lon, zoom) => void pick(lat, lon, zoom)} label="Mapa para elegir tu zona de trabajo" />

      {suggesting === 'loading' && <output className="zone-picker__note">Buscando…</output>}
      {suggesting === 'none' && <output className="zone-picker__note">No encontramos ese lugar. Probá con el barrio y la ciudad, por ejemplo «Cordón, Montevideo».</output>}
      {status === 'outside' && <output className="zone-picker__note">Elegí un lugar dentro de Uruguay.</output>}
      {(status === 'error' || suggesting === 'error') && <p className="zone-picker__note" role="alert">No pudimos buscar en el mapa en este momento. Podés escribir tu zona a mano.</p>}
    </div>
  )
}

export default ZonePicker
