import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './ZoneMap.css'

/** Where to look: with a box, the map fits it; with only a point, it centres on it and keeps its zoom. */
export interface MapFocus {
  lat: number
  lon: number
  /** west, south, east, north */
  bbox?: [number, number, number, number]
}

interface ZoneMapProps {
  focus: MapFocus | null
  /**
   * With `onPick`: a tap on the map, or dragging the pin, chooses that point (and says how close the map
   * was looking, which is how precise the choice should be). Without: it only shows the zone.
   */
  onPick?: (lat: number, lon: number, zoom: number) => void
  /** What a screen reader says the map is. */
  label: string
}

// Uruguay, for when there is nothing to look at yet.
const COUNTRY_BOUNDS: L.LatLngBoundsLiteral = [[-35.0, -58.5], [-30.0, -53.0]]

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

// The one thing that has to stay on the map: OpenStreetMap's licence asks for this credit. Nothing
// else from the default map (report a problem, donate, terms) is needed, so it is not shown.
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

const pin = L.divIcon({ className: 'zone-pin-wrap', html: '<span class="zone-pin"></span>', iconSize: [26, 26], iconAnchor: [13, 13] })

/**
 * A plain map of a zone. It is the same one for the profile (only shown) and for the forms (where the
 * zone is picked). Both can be zoomed in and out; only the second one picks a point when it is touched.
 */
function ZoneMap({ focus, onPick, label }: Readonly<ZoneMapProps>) {
  const container = useRef<HTMLElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  // The map is built once; this always points at the latest callback.
  const pick = useRef(onPick)
  const interactive = onPick !== undefined

  useEffect(() => {
    pick.current = onPick
  })

  useEffect(() => {
    const element = container.current
    if (!element) return

    const created = L.map(element, {
      zoomControl: true,
      attributionControl: false,
      // A map that is only shown must not trap a finger that is scrolling the page: on a phone it is
      // zoomed with its buttons or a pinch, and moved by dragging only where there is a mouse.
      dragging: interactive || !L.Browser.mobile,
      touchZoom: true,
      doubleClickZoom: true,
      // Out of Uruguay there is nothing to see.
      minZoom: 5,
      // The wheel zooms the map while the mouse is over it (and doesn't scroll the page then).
      scrollWheelZoom: true,
      boxZoom: false,
      keyboard: false,
    })
    created.fitBounds(COUNTRY_BOUNDS)
    L.control.attribution({ prefix: false }).addTo(created)
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(created)

    // The zoom level is published on the element (data-zoom): it is what the tests read, and costs nothing.
    const publishZoom = () => { element.dataset.zoom = String(created.getZoom()) }
    created.on('zoomend', publishZoom)
    publishZoom()

    if (interactive) {
      created.on('click', (event: L.LeafletMouseEvent) => pick.current?.(event.latlng.lat, event.latlng.lng, created.getZoom()))
    }

    // The container can get its size after the map exists (a section that opens, a resize).
    const observer = new ResizeObserver(() => created.invalidateSize())
    observer.observe(element)

    map.current = created
    return () => {
      observer.disconnect()
      created.remove()
      map.current = null
      marker.current = null
    }
  }, [interactive])

  useEffect(() => {
    const current = map.current
    if (!current) return

    if (!focus) {
      marker.current?.remove()
      marker.current = null
      current.fitBounds(COUNTRY_BOUNDS)
      return
    }

    const point = L.latLng(focus.lat, focus.lon)

    if (!marker.current) {
      marker.current = L.marker(point, { icon: pin, draggable: interactive, keyboard: false, interactive })
        .on('dragend', () => {
          const moved = marker.current?.getLatLng()
          if (moved) pick.current?.(moved.lat, moved.lng, current.getZoom())
        })
        .addTo(current)
    } else {
      marker.current.setLatLng(point)
    }

    if (focus.bbox) {
      const [west, south, east, north] = focus.bbox
      // Up to street level: a precise place is shown close, with the streets around it.
      current.fitBounds([[south, west], [north, east]], { maxZoom: 17, padding: [12, 12] })
    } else {
      current.setView(point, Math.max(current.getZoom(), 12))
    }
  }, [focus, interactive])

  return <section ref={container} className="zone-map" aria-label={label} />
}

export default ZoneMap
