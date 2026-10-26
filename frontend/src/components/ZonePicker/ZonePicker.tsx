import { useEffect, useRef, useState } from 'react'
import { lookupBestZone, reverseZone, reverseZoomFor, sharedZoneCache, suggestZones, type ZoneChoice } from '../../services/zoneMap'
import ZoneMap, { type MapFocus } from '../ZoneMap/ZoneMap'
import './ZonePicker.css'

/** A point on the map, in degrees. */
export interface ZonePoint {
  lat: number
  lon: number
}

interface ZonePickerProps {
  /** What is written in the location field: it is the search, and what ends up saved. */
  query: string
  /**
   * The zone chosen, as the short name to keep in the field, and the point it was chosen at: where the map
   * was tapped (or the person is), or the centre of the place suggested.
   */
  onChoose: (label: string, point: ZonePoint) => void
  /**
   * For a form that opens with a zone already saved: puts the map on it. Once, the first time the field has
   * a value (it may arrive after the form is drawn); what is typed afterwards is suggested as usual.
   */
  locateSaved?: boolean
  /** With `locateSaved`: the point saved with the zone. The map goes there instead of searching the name. */
  savedPoint?: ZonePoint | null
  /** Draws the area covered around the point, in kilometres. */
  radiusKm?: number
  /** What a screen reader says the map is for. */
  mapLabel?: string
}

/** Tapping the map: what is being asked and how it went. */
type Status = 'idle' | 'locating' | 'searching' | 'error' | 'outside'
/** Suggesting while typing. */
type Suggesting = 'idle' | 'loading' | 'none' | 'error'

/** How long to wait after the last key before asking, and how much has to be written: the search service is shared. */
const SUGGEST_DELAY_MS = 400
const MIN_LETTERS = 3

/** The person's own position: a recent one is good enough, and a phone shouldn't switch its GPS on for it. */
const POSITION_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 }
/** Nominatim's zoom for the zone of the person's position: a neighbourhood, not their front door. */
const CURRENT_ZONE_ZOOM = 14

/**
 * The map under the location field. While the field is typed in, places that match are suggested (from
 * Photon, which is made for it); picking one, or tapping the map, puts its name in the field. It doesn't
 * replace typing the zone by hand, it helps to find it.
 */
function ZonePicker({ query, onChoose, locateSaved = false, savedPoint, radiusKm, mapLabel = 'Mapa para elegir tu zona de trabajo' }: Readonly<ZonePickerProps>) {
  const [choices, setChoices] = useState<ZoneChoice[]>([])
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [suggesting, setSuggesting] = useState<Suggesting>('idle')
  const located = useRef(false)
  // The position arrives later: by then the field may have been typed in or loaded, and is then left alone.
  const latestQuery = useRef(query)
  const latestOnChoose = useRef(onChoose)
  /** The text that came from a choice or the saved zone: it is not something typed, so it isn't searched. */
  const settled = useRef('')

  useEffect(() => {
    latestQuery.current = query
    latestOnChoose.current = onChoose
  })

  // Once, when the map appears: if nothing is written yet, the map goes where the person is and the field gets that zone.
  useEffect(() => {
    if (latestQuery.current.trim() || !('geolocation' in navigator)) return
    let active = true
    setStatus('locating')

    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      if (!active) return
      try {
        const zone = await reverseZone(coords.latitude, coords.longitude, { zoom: CURRENT_ZONE_ZOOM })
        // Out of Uruguay, or the field was filled meanwhile: the map stays as it is.
        if (!active || !zone || latestQuery.current.trim()) return
        setFocus({ lat: coords.latitude, lon: coords.longitude })
        settled.current = zone.label
        latestOnChoose.current(zone.label, { lat: coords.latitude, lon: coords.longitude })
      } catch {
        // Without a name for the point the map just stays on the country.
      } finally {
        if (active) setStatus(current => current === 'locating' ? 'idle' : current)
      }
    }, () => {
      // Not allowed or not known: the zone is chosen by hand, as before.
      if (active) setStatus(current => current === 'locating' ? 'idle' : current)
    }, POSITION_OPTIONS)

    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!locateSaved || located.current || !query.trim()) return
    located.current = true
    settled.current = query.trim()

    if (savedPoint) {
      setFocus({ lat: savedPoint.lat, lon: savedPoint.lon })
      return
    }

    lookupBestZone(query, { cache: sharedZoneCache() })
      .then(place => { if (place) setFocus(place) })
      .catch(() => { /* the map just stays on the country: the zone is still written in the field */ })
  }, [locateSaved, query, savedPoint])

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
    onChoose(choice.label, { lat: choice.lat, lon: choice.lon })
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
        onChoose(zone.label, { lat, lon })
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

      <ZoneMap focus={focus} onPick={(lat, lon, zoom) => void pick(lat, lon, zoom)} radiusKm={radiusKm} label={mapLabel} />

      {/* Only while nothing is written: the browser may still be asking the person, and typing answers it too */}
      {status === 'locating' && !query.trim() && <output className="zone-picker__note zone-picker__note--busy">Buscando tu ubicación…</output>}
      {suggesting === 'loading' && <output className="zone-picker__note zone-picker__note--busy">Buscando coincidencias…</output>}
      {/* Finding the name of a tapped point takes a moment: say so, so the tap doesn't look ignored */}
      {status === 'searching' && <output className="zone-picker__note zone-picker__note--busy">Buscando coincidencias para ese punto del mapa…</output>}
      {suggesting === 'none' && <output className="zone-picker__note">No encontramos ese lugar. Probá con el barrio y la ciudad, por ejemplo «Cordón, Montevideo».</output>}
      {status === 'outside' && <output className="zone-picker__note">Elegí un lugar dentro de Uruguay.</output>}
      {(status === 'error' || suggesting === 'error') && <p className="zone-picker__note" role="alert">No pudimos buscar en el mapa en este momento. Podés escribir la ubicación a mano.</p>}
    </div>
  )
}

export default ZonePicker
