import type { Schedule } from '../../types/Schedule'

export function professionalAvailability(schedules: Schedule[], reference = new Date()): string {
    const next = schedules
        .filter(schedule => schedule.type === 'URGENT_AVAILABLE'
            && new Date(schedule.startTimestamp) < new Date(schedule.endTimestamp)
            && new Date(schedule.endTimestamp) > reference)
        .sort((a, b) => new Date(a.startTimestamp).getTime() - new Date(b.startTimestamp).getTime())[0]

    if (!next) return 'Sin disponibilidad esta semana'

    const start = new Date(next.startTimestamp)
    const end = new Date(next.endTimestamp)
    const day = start.toDateString() === reference.toDateString()
        ? 'hoy'
        : start.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'numeric' })
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false } as const
    const endDay = start.toDateString() === end.toDateString()
        ? ''
        : `${end.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'numeric' })} `

    return `Disponible ${day}, ${start.toLocaleTimeString('es-UY', timeOptions)} – ${endDay}${end.toLocaleTimeString('es-UY', timeOptions)}`
}

/** The days the service is needed, both included, as local dates "2030-01-02". */
export interface DayRange {
    from: string
    to: string
}

const startOfDay = (date: Date, plusDays = 0) => {
    const day = new Date(date)
    day.setDate(day.getDate() + plusDays)
    day.setHours(0, 0, 0, 0)
    return day
}

/** A day as "2030-01-02", in local time (toISOString would give the UTC day). */
export function dayKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** "2030-01-02" as that day's local midnight. */
export function dayFromKey(key: string): Date {
    const [year, month, day] = key.split('-').map(Number)
    return new Date(year, month - 1, day)
}

/** The quick choices next to the calendar. */
export function presetRanges(reference = new Date()): { label: string; range: DayRange }[] {
    const today = dayKey(reference)
    const tomorrow = dayKey(startOfDay(reference, 1))
    const sunday = dayKey(startOfDay(reference, 6 - ((reference.getDay() + 6) % 7)))
    return [
        { label: 'Hoy', range: { from: today, to: today } },
        { label: 'Mañana', range: { from: tomorrow, to: tomorrow } },
        { label: 'Esta semana', range: { from: today, to: sunday } },
    ]
}

/** How a range reads on the filter's tag: "hoy", "mié 2/1", "2/1 – 6/1". */
export function rangeLabel(range: DayRange, reference = new Date()): string {
    const short = (key: string) => key === dayKey(reference) ? 'hoy'
        : dayFromKey(key).toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'numeric' })
    return range.from === range.to ? short(range.from) : `${short(range.from)} – ${short(range.to)}`
}

/**
 * The stretch the search asks free time for: from the first day (or from now, if that is later) to the
 * end of the last day. A free block that overlaps it counts.
 */
export function availabilityWindow(range: DayRange, reference = new Date()): { from: Date; to: Date } {
    const firstDay = dayFromKey(range.from)
    return { from: firstDay > reference ? firstDay : reference, to: startOfDay(dayFromKey(range.to), 1) }
}
