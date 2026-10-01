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
