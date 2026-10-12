const dayFormatter = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Montevideo' })
const timeFormatter = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Montevideo' })

export interface TimeframeParts {
    /** "jueves, 15 de octubre" */
    day: string
    /** "19:00" */
    startTime: string
    endTime: string
}

export type TimeframePart = keyof TimeframeParts

export function timeframeParts(start: string, end: string): TimeframeParts {
    const startDate = new Date(start)
    return { day: dayFormatter.format(startDate), startTime: timeFormatter.format(startDate), endTime: timeFormatter.format(new Date(end)) }
}

/** The timeframe in a sentence: "el jueves, 15 de octubre de 19:00 a 21:00". */
export function timeframeText(start: string, end: string): string {
    const { day, startTime, endTime } = timeframeParts(start, end)
    return `el ${day} de ${startTime} a ${endTime}`
}

/** Which pieces of the timeframe a reschedule moves, so only those are marked. */
export function changedParts(current: TimeframeParts, proposed: TimeframeParts): Set<TimeframePart> {
    const parts: TimeframePart[] = ['day', 'startTime', 'endTime']
    return new Set(parts.filter(part => current[part] !== proposed[part]))
}
