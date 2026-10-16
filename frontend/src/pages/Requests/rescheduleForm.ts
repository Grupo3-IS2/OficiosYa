export interface RescheduleDraft {
    date: string
    startTime: string
    endTime: string
}

function pad(value: number): string {
    return String(value).padStart(2, '0')
}

function dateValue(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function timeValue(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Starts from the agreed timeframe, so the client only changes what moves. */
export function rescheduleDraftFrom(start?: string | null, end?: string | null): RescheduleDraft {
    if (!start || !end) return { date: '', startTime: '', endTime: '' }
    const startDate = new Date(start)
    return { date: dateValue(startDate), startTime: timeValue(startDate), endTime: timeValue(new Date(end)) }
}

export interface CurrentTimeframe {
    start?: string | null
    end?: string | null
}

/**
 * The draft as instants in the browser's time zone, or the message to show if it can't be sent.
 * `current` is the timeframe already agreed: proposing it again changes nothing.
 */
export function rescheduleTimeframe(draft: RescheduleDraft, current: CurrentTimeframe = {}, now = new Date()): { start: Date; end: Date } | { error: string } {
    if (!draft.date || !draft.startTime || !draft.endTime) return { error: 'Elegí la fecha y el horario.' }

    const start = new Date(`${draft.date}T${draft.startTime}`)
    const end = new Date(`${draft.date}T${draft.endTime}`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: 'La fecha o el horario no son válidos.' }
    if (end <= start) return { error: 'La hora de fin tiene que ser posterior a la de inicio.' }
    if (start <= now) return { error: 'El horario tiene que ser en el futuro.' }
    if (current.start && current.end
        && new Date(current.start).getTime() === start.getTime()
        && new Date(current.end).getTime() === end.getTime()) {
        return { error: 'El nuevo horario es igual al actual. Elegí uno distinto.' }
    }

    return { start, end }
}
