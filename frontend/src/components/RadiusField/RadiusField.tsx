import { useState, type CSSProperties } from 'react'
import './RadiusField.css'

/** The bounds the backend accepts: up to 800 km reaches every corner of Uruguay from any point in it. */
export const MIN_RADIUS_KM = 1
export const MAX_RADIUS_KM = 800
/** The slider covers the usual distances; anything further is typed in the box. */
const SLIDER_MAX_KM = 50
/** What a professional starts with: a city of Montevideo's size is about 20 km across. */
export const DEFAULT_RADIUS_KM = 10

interface RadiusFieldProps {
  id: string
  value: number
  onChange: (radiusKm: number) => void
}

const formatKm = (km: number) => `${km.toLocaleString('es-UY')} km`

/** How far a professional goes from their point, in whole kilometres; the map draws it as they move it. */
function RadiusField({ id, value, onChange }: Readonly<RadiusFieldProps>) {
  // What is being typed, so clearing the box to write a new number doesn't snap it back mid-way.
  const [typed, setTyped] = useState<string | null>(null)
  const type = (text: string) => {
    setTyped(text)
    const km = Number(text)
    if (text !== '' && Number.isInteger(km) && km >= MIN_RADIUS_KM && km <= MAX_RADIUS_KM) onChange(km)
  }
  const filled = `${((Math.min(value, SLIDER_MAX_KM) - MIN_RADIUS_KM) / (SLIDER_MAX_KM - MIN_RADIUS_KM)) * 100}%`

  return (
    <div className="radius-field">
      <div className="radius-field__selection"><label htmlFor={id}>Hasta dónde llegás</label><strong>{formatKm(value)}</strong></div>
      <div className="radius-field__entry">
        <div className="radius-field__input">
          <input aria-label="Ingresar distancia en kilómetros" type="number" min={MIN_RADIUS_KM} max={MAX_RADIUS_KM} step={1}
            value={typed ?? value} onChange={event => type(event.target.value)} onBlur={() => setTyped(null)} />
        </div>
        <span aria-hidden="true">km</span>
      </div>
      <div className="radius-field__slider" style={{ '--range-end': filled } as CSSProperties}>
        <input id={id} type="range" min={MIN_RADIUS_KM} max={SLIDER_MAX_KM} step={1} value={Math.min(value, SLIDER_MAX_KM)}
          onChange={event => { setTyped(null); onChange(Number(event.target.value)) }} aria-valuetext={formatKm(value)} />
      </div>
      <div className="radius-field__bounds"><span>{formatKm(MIN_RADIUS_KM)}</span><span>{formatKm(SLIDER_MAX_KM)}+</span></div>
    </div>
  )
}

export default RadiusField
