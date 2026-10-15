import { useState } from 'react'
import { dayFromKey, dayKey, type DayRange } from '../professionalAvailability'
import './DateRangeCalendar.css'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

interface Props {
    value: DayRange | null
    onChange: (range: DayRange) => void
    /** The first and last days that can be chosen. */
    min: string
    max: string
}

/** The days of a month as a Monday-first grid: null for the blanks before the 1st. */
function monthDays(year: number, month: number): (string | null)[] {
    const blanks = (new Date(year, month, 1).getDay() + 6) % 7
    const count = new Date(year, month + 1, 0).getDate()
    return [...Array<null>(blanks).fill(null), ...Array.from({ length: count }, (_, index) => dayKey(new Date(year, month, index + 1)))]
}

/**
 * A month to choose days on: the first tap starts the range (one day on its own is a range too), the second
 * ends it; the dates are "2030-01-02" strings, so comparing them as text compares the days.
 */
export default function DateRangeCalendar({ value, onChange, min, max }: Readonly<Props>) {
    const first = dayFromKey(value?.from ?? min)
    const [shown, setShown] = useState({ year: first.getFullYear(), month: first.getMonth() })
    // After the first tap the next one ends the range.
    const [pickingEnd, setPickingEnd] = useState(false)

    const monthStart = dayKey(new Date(shown.year, shown.month, 1))
    const monthEnd = dayKey(new Date(shown.year, shown.month + 1, 0))
    // "octubre de 2026" → "Octubre de 2026"
    const monthName = new Date(shown.year, shown.month, 1).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' })
    const monthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1)
    const move = (months: number) => setShown(({ year, month }) => {
        const date = new Date(year, month + months, 1)
        return { year: date.getFullYear(), month: date.getMonth() }
    })

    function pick(day: string) {
        if (pickingEnd && value) {
            onChange(day < value.from ? { from: day, to: value.from } : { from: value.from, to: day })
            setPickingEnd(false)
        } else {
            onChange({ from: day, to: day })
            setPickingEnd(true)
        }
    }

    return (
        <div className="date-range-calendar">
            <div className="date-range-calendar__header">
                <button type="button" aria-label="Mes anterior" disabled={monthStart <= min} onClick={() => move(-1)}>‹</button>
                <strong aria-live="polite">{monthTitle}</strong>
                <button type="button" aria-label="Mes siguiente" disabled={monthEnd >= max} onClick={() => move(1)}>›</button>
            </div>
            <div className="date-range-calendar__grid" role="group" aria-label="Elegí los días">
                {WEEKDAYS.map(weekday => <span key={weekday} className="date-range-calendar__weekday" aria-hidden="true">{weekday}</span>)}
                {monthDays(shown.year, shown.month).map((day, index) => {
                    if (!day) return <span key={`blank-${index}`} />
                    const inRange = value !== null && day >= value.from && day <= value.to
                    const edge = value !== null && (day === value.from || day === value.to)
                    return (
                        <button key={day} type="button" disabled={day < min || day > max} aria-pressed={inRange}
                            aria-label={dayFromKey(day).toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })}
                            className={`${inRange ? 'in-range' : ''}${edge ? ' edge' : ''}`} onClick={() => pick(day)}>
                            {Number(day.slice(8))}
                        </button>
                    )
                })}
            </div>
            <small className="date-range-calendar__hint">{pickingEnd ? 'Tocá otro día para terminar el rango, o dejalo en un solo día.' : 'Tocá el primer día.'}</small>
        </div>
    )
}
