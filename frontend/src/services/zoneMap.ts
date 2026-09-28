/**
 * The map of the zone a professional works in, from OpenStreetMap: no key, no account.
 *
 * The zone is free text ("Cordón, Montevideo"), and OpenStreetMap's embedded map needs coordinates,
 * so Nominatim (OpenStreetMap's search) turns the text into a place first. Nominatim is a shared
 * service that asks for at most one request per second and no bulk use: one lookup per profile
 * that is opened, and what was found is kept (see `createZoneCache`).
 *
 * Nominatim doesn't allow searching while someone types, so the suggestions of the location field come
 * from Photon (photon.komoot.io), OpenStreetMap's search made for that, with the same data.
 */

export interface ZonePlace {
  lat: number
  lon: number
  /** west, south, east, north */
  bbox: [number, number, number, number]
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const PHOTON_SEARCH = 'https://photon.komoot.io/api/'

/** Uruguay's box (west, south, east, north): Photon looks inside it first. */
const COUNTRY_BBOX = '-58.45,-35.0,-53.0,-30.0'

const MAX_SUGGESTIONS = 5

/** Below this many degrees (about 400 metres) a box is a doorway, not a place to look at: it is widened to it. */
const MIN_SPAN = 0.004

/** The zones are in Uruguay. */
const COUNTRY = 'uy'

export function searchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    countrycodes: COUNTRY,
    'accept-language': 'es',
  })
  return `${NOMINATIM_SEARCH}?${params.toString()}`
}

function widen(low: number, high: number): [number, number] {
  if (high - low >= MIN_SPAN) return [low, high]
  const center = (low + high) / 2
  return [center - MIN_SPAN / 2, center + MIN_SPAN / 2]
}

interface NominatimItem {
  lat?: unknown
  lon?: unknown
  boundingbox?: unknown
  address?: Record<string, string>
  display_name?: unknown
}

function toPlace(item: NominatimItem): ZonePlace | null {
  const lat = Number(item.lat)
  const lon = Number(item.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  // Nominatim gives [south, north, west, east], as strings.
  const box = Array.isArray(item.boundingbox) ? item.boundingbox.map(Number) : []
  const [south, north, west, east] = box.length === 4 && box.every(Number.isFinite)
    ? box
    : [lat, lat, lon, lon]

  const [w, e] = widen(west, east)
  const [s, n] = widen(south, north)
  return { lat, lon, bbox: [w, s, e, n] }
}

/** The first result of a Nominatim search as a place, or null if there is none or it isn't usable. */
export function parsePlace(results: unknown): ZonePlace | null {
  if (!Array.isArray(results) || results.length === 0) return null
  return toPlace(results[0] as NominatimItem)
}

/** A place someone can choose, with the short name that is stored as their zone. */
export interface ZoneChoice extends ZonePlace {
  label: string
  /** The long name, to tell apart two places that are called the same. */
  details: string
}

const dedupe = (parts: (string | undefined)[]) =>
  parts.filter((part): part is string => !!part).filter((part, index, all) =>
    all.findIndex(other => other.toLowerCase() === part.toLowerCase()) === index)

/** OpenStreetMap groups the numbers of a building ("1234,1236;1240"): one is enough. */
function firstNumber(houseNumber?: string): string | undefined {
  return houseNumber?.split(/[;,]/)[0].trim() || undefined
}

/**
 * A short name for the place, as people write it: "Cordón, Montevideo", "Pando, Canelones", and when it is
 * as precise as a street, "18 de Julio 1234, Cordón, Montevideo". Nominatim's own name is a full address with
 * the country and postcode, too long to keep.
 */
export function placeLabel(address: Record<string, string> | undefined, displayName?: string): string {
  if (address) {
    const road = address.road ?? address.pedestrian ?? address.residential ?? address.living_street ?? address.footway ?? address.path
    const street = road ? [road, firstNumber(address.house_number)].filter(Boolean).join(' ') : undefined
    const locality = address.suburb ?? address.neighbourhood ?? address.quarter ?? address.city_district ?? address.borough
    const city = address.city ?? address.town ?? address.village ?? address.hamlet ?? address.municipality ?? address.county
    const state = address.state?.replace(/^Departamento de /i, '')
    const label = dedupe([street, locality, city, state]).slice(0, 4).join(', ')
    if (label) return label
  }

  return (displayName ?? '').split(',').slice(0, 2).map(part => part.trim()).filter(Boolean).join(', ')
}

function toChoice(item: NominatimItem): ZoneChoice | null {
  const place = toPlace(item)
  if (!place) return null

  // The zones are in Uruguay: a result from elsewhere isn't a choice.
  const country = item.address?.country_code
  if (country && country.toLowerCase() !== COUNTRY) return null

  const details = typeof item.display_name === 'string' ? item.display_name : ''
  const label = placeLabel(item.address, details)
  return label ? { ...place, label, details } : null
}

interface PhotonProperties {
  name?: string
  street?: string
  housenumber?: string
  district?: string
  locality?: string
  city?: string
  county?: string
  state?: string
  postcode?: string
  countrycode?: string
  type?: string
  osm_key?: string
  extent?: unknown
}

/** Photon's properties written as the address Nominatim would give, so both are named the same way. */
function photonAddress(props: PhotonProperties): Record<string, string> {
  const { name, type } = props
  const address: Record<string, string> = {}
  const set = (key: string, value?: string) => { if (value) address[key] = value }

  set('road', type === 'house' ? props.street : type === 'street' ? name : undefined)
  set('house_number', type === 'house' ? props.housenumber : undefined)
  set('suburb', type === 'district' || type === 'locality' || type === 'other' ? name : (props.district ?? props.locality))
  set('city', type === 'city' || type === 'town' || type === 'village' ? name : props.city)
  set('county', type === 'county' ? name : props.county)
  set('state', type === 'state' ? name : props.state)
  return address
}

function photonChoice(feature: unknown): ZoneChoice | null {
  const { geometry, properties } = (feature ?? {}) as { geometry?: { coordinates?: unknown }; properties?: PhotonProperties }
  const coordinates = geometry?.coordinates
  if (!properties || !Array.isArray(coordinates)) return null

  // The zones are in Uruguay, and a shop or an amenity is not a zone: only addresses, streets and areas.
  if (properties.countrycode?.toUpperCase() !== COUNTRY.toUpperCase()) return null
  if (properties.type === 'house' && properties.name) return null
  if (properties.type === 'other' && properties.osm_key !== 'place' && properties.osm_key !== 'boundary') return null

  // Photon gives [west, north, east, south].
  const extent = Array.isArray(properties.extent) ? properties.extent.map(Number) : []
  const [west, north, east, south] = extent.length === 4 && extent.every(Number.isFinite) ? extent : [NaN, NaN, NaN, NaN]
  const place = toPlace({
    lon: coordinates[0],
    lat: coordinates[1],
    boundingbox: Number.isFinite(west) ? [south, north, west, east] : undefined,
  })
  if (!place) return null

  const label = placeLabel(photonAddress(properties))
  const details = dedupe([properties.name, [properties.street, properties.housenumber].filter(Boolean).join(' '), properties.district, properties.locality, properties.city, properties.county, properties.state]).join(', ')
  return label ? { ...place, label, details } : null
}

/** Photon's answer as places to choose from (two that would be saved under the same name are one). */
export function parseSuggestions(collection: unknown): ZoneChoice[] {
  const features = (collection as { features?: unknown } | null)?.features
  if (!Array.isArray(features)) return []
  return features
    .map(photonChoice)
    .filter((choice): choice is ZoneChoice => choice !== null)
    .filter((choice, index, all) => all.findIndex(other => other.label === choice.label) === index)
    .slice(0, MAX_SUGGESTIONS)
}

/** What is at a point, from Nominatim's reverse search: null if it is not in Uruguay or has no name. */
export function parseReverse(result: unknown): ZoneChoice | null {
  if (typeof result !== 'object' || result === null) return null
  return toChoice(result as NominatimItem)
}

const round = (value: number) => Number(value.toFixed(6))

/** The suggestions for what is being typed. It asks for more than it shows: some are from outside Uruguay or not zones. */
export function suggestUrl(query: string): string {
  const params = new URLSearchParams({ q: query, limit: '10', bbox: COUNTRY_BBOX })
  return `${PHOTON_SEARCH}?${params.toString()}`
}

/**
 * How precise a name to ask for a point of the map: the closer the map is looking, the more precise. Far away
 * it is a neighbourhood (Nominatim's zoom 14), closer the main streets (16), and at street level the address (18).
 */
export function reverseZoomFor(mapZoom: number): number {
  if (mapZoom >= 16) return 18
  if (mapZoom >= 13) return 16
  return 14
}

/** What is at a point. `zoom` is Nominatim's: 14 is a neighbourhood, 16 a main street, 18 a building. */
export function reverseUrl(lat: number, lon: number, zoom = 14): string {
  const params = new URLSearchParams({
    lat: String(round(lat)),
    lon: String(round(lon)),
    format: 'jsonv2',
    zoom: String(zoom),
    addressdetails: '1',
    'accept-language': 'es',
  })
  return 'https://nominatim.openstreetmap.org/reverse?' + params.toString()
}

/** The address of the map to put in an iframe. */
export function embedUrl(place: ZonePlace): string {
  const [west, south, east, north] = place.bbox.map(round)
  const bbox = encodeURIComponent(`${west},${south},${east},${north}`)
  const marker = encodeURIComponent(`${round(place.lat)},${round(place.lon)}`)
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`
}

/** The same place on openstreetmap.org, for whoever wants a bigger map. */
export function largerMapUrl(place: ZonePlace): string {
  const lat = round(place.lat)
  const lon = round(place.lon)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`
}

export interface ZoneCache {
  /** undefined: never looked up. null: looked up and not found. */
  get(key: string): ZonePlace | null | undefined
  set(key: string, place: ZonePlace | null): void
}

const STORAGE_PREFIX = 'oficiosya_zone:v1:'

/**
 * Remembers lookups for the page's life, and the ones that found something in `storage` too, so the
 * same zone isn't asked for twice. Storage can be missing or throw (private windows): it then
 * only remembers in memory.
 */
export function createZoneCache(storage?: Pick<Storage, 'getItem' | 'setItem'>): ZoneCache {
  const memory = new Map<string, ZonePlace | null>()

  return {
    get(key) {
      if (memory.has(key)) return memory.get(key)
      try {
        const stored = storage?.getItem(STORAGE_PREFIX + key)
        if (stored) {
          const place = JSON.parse(stored) as ZonePlace
          memory.set(key, place)
          return place
        }
      } catch { /* nothing usable stored */ }
      return undefined
    },
    set(key, place) {
      memory.set(key, place)
      if (!place) return
      try {
        storage?.setItem(STORAGE_PREFIX + key, JSON.stringify(place))
      } catch { /* storage full or blocked: memory is enough */ }
    },
  }
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

let shared: ZoneCache | undefined

/** The one cache of the page: the profile's map and the zone pickers don't ask twice for the same zone. */
export function sharedZoneCache(): ZoneCache {
  shared ??= createZoneCache(safeStorage())
  return shared
}

function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

interface LookupOptions {
  fetchFn?: typeof fetch
  cache?: ZoneCache
}

/**
 * Searches that are on their way, by zone. Asking again for the same zone meanwhile (React runs
 * an effect twice in development, two components can show the same zone) joins that search
 * instead of sending another one to a service that asks to be used sparingly.
 */
const inFlight = new Map<string, Promise<ZonePlace | null>>()

/**
 * Where the zone is, or null if OpenStreetMap doesn't know it. Throws if the search itself failed
 * (network, or the service refusing): that is not "not found" and isn't remembered as one.
 */
export async function lookupZone(
  query: string,
  { fetchFn = fetch, cache }: LookupOptions = {},
): Promise<ZonePlace | null> {
  const key = cacheKey(query)
  if (!key) return null

  const known = cache?.get(key)
  if (known !== undefined) return known

  const running = inFlight.get(key)
  if (running) return running

  const search = (async () => {
    const response = await fetchFn(searchUrl(query.trim()), { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Nominatim answered ${response.status}`)

    const place = parsePlace(await response.json())
    cache?.set(key, place)
    return place
  })().finally(() => inFlight.delete(key))

  inFlight.set(key, search)
  return search
}

async function getJson(url: string, fetchFn: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchFn(url, { headers: { Accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(`The map service answered ${response.status}`)
  return response.json()
}

const suggestions = new Map<string, ZoneChoice[]>()
const SUGGESTIONS_KEPT = 50

/**
 * The places that match what is being typed (at most five). Throws if the search itself failed. What was
 * asked is kept for a while, so going back over the text doesn't ask again.
 */
export async function suggestZones(
  query: string,
  { fetchFn = fetch, signal }: { fetchFn?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ZoneChoice[]> {
  const key = cacheKey(query)
  if (!key) return []

  const known = suggestions.get(key)
  if (known) return known

  const found = parseSuggestions(await getJson(suggestUrl(query.trim()), fetchFn, signal))
  if (suggestions.size >= SUGGESTIONS_KEPT) suggestions.delete(suggestions.keys().next().value as string)
  suggestions.set(key, found)
  return found
}

/** The place at a point of the map, or null if there is none (or it isn't in Uruguay). */
export async function reverseZone(
  lat: number,
  lon: number,
  { fetchFn = fetch, zoom = 14 }: { fetchFn?: typeof fetch; zoom?: number } = {},
): Promise<ZoneChoice | null> {
  return parseReverse(await getJson(reverseUrl(lat, lon, zoom), fetchFn))
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Where a saved name is. A precise one ("18 de Julio 1234, Cordón, Montevideo") may be something OpenStreetMap
 * does not have: then it looks for the same name without its most precise part, so the map still shows the
 * neighbourhood. Each new attempt waits a little: Nominatim asks for at most one request a second.
 */
export async function lookupBestZone(
  label: string,
  { fetchFn = fetch, cache, pauseMs = 1100 }: LookupOptions & { pauseMs?: number } = {},
): Promise<ZonePlace | null> {
  const parts = label.split(',').map(part => part.trim()).filter(Boolean)

  // At most two steps down: "street, area, city, department" -> "area, city, department" -> "city, department".
  for (let skipped = 0; skipped < parts.length && skipped <= 2; skipped++) {
    if (skipped > 0) await wait(pauseMs)
    const place = await lookupZone(parts.slice(skipped).join(', '), { fetchFn, cache })
    if (place) return place
  }
  return null
}
