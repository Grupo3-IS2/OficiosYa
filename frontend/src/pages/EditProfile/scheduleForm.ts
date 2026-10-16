export interface ScheduleDraft {
    date: string
    startTime: string
    endTime: string
}

export type ScheduleRepeat = 'NEVER' | 'WEEK' | 'WEEKDAYS' | 'MONTH_WEEKDAY' | 'YEAR_WEEKDAY'

function pad(value: number): string {
    return String(value).padStart(2, '0')
}

function quarterHour(date: Date): string {
    const totalMinutes = Math.min(23 * 60 + 45, Math.max(0, Math.round((date.getHours() * 60 + date.getMinutes()) / 15) * 15))
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`
}

export const quarterHourOptions = Array.from({ length: 96 }, (_, index) => {
    const totalMinutes = index * 15
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`
})

export function emptyScheduleDraft(reference = new Date()): ScheduleDraft {
    return {
        date: `${reference.getFullYear()}-${pad(reference.getMonth() + 1)}-${pad(reference.getDate())}`,
        startTime: '09:00',
        endTime: '18:00',
    }
}

export function scheduleDraftFrom(startTimestamp: string, endTimestamp: string): ScheduleDraft {
    const start = new Date(startTimestamp)
    const end = new Date(endTimestamp)
    return {
        date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        startTime: quarterHour(start),
        endTime: quarterHour(end),
    }
}

function localDateTime(date: string, time: string): Date | null {
    const dateParts = date.split('-').map(Number)
    const timeParts = time.split(':').map(Number)
    if (dateParts.length !== 3 || timeParts.length !== 2 || [...dateParts, ...timeParts].some(part => !Number.isInteger(part))) return null

    const [year, month, day] = dateParts
    const [hour, minute] = timeParts
    const value = new Date(year, month - 1, day, hour, minute)
    if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day
        || value.getHours() !== hour || value.getMinutes() !== minute) return null
    return value
}

export function scheduleDraftDates(draft: ScheduleDraft): { start: Date; end: Date } | null {
    if (!quarterHourOptions.includes(draft.startTime) || !quarterHourOptions.includes(draft.endTime)) return null
    const start = localDateTime(draft.date, draft.startTime)
    const end = localDateTime(draft.date, draft.endTime)
    if (!start || !end || start >= end) return null
    return { start, end }
}

function datesForDay(day: Date, start: Date, end: Date): { start: Date; end: Date } {
    return {
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes()),
        end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), end.getHours(), end.getMinutes()),
    }
}

export function repeatedScheduleDates(draft: ScheduleDraft, repeat: ScheduleRepeat): { start: Date; end: Date }[] {
    const base = scheduleDraftDates(draft)
    if (!base) return []
    if (repeat === 'NEVER') return [base]

    const dates: { start: Date; end: Date }[] = []
    const day = new Date(base.start.getFullYear(), base.start.getMonth(), base.start.getDate())

    if (repeat === 'WEEK' || repeat === 'WEEKDAYS') {
        const monday = new Date(day)
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
        const numberOfDays = repeat === 'WEEK' ? 7 : 5
        for (let offset = 0; offset < numberOfDays; offset++) {
            const repeatedDay = new Date(monday)
            repeatedDay.setDate(repeatedDay.getDate() + offset)
            dates.push(datesForDay(repeatedDay, base.start, base.end))
        }
        return dates
    }

    const baseMonth = day.getMonth()
    const baseYear = day.getFullYear()
    while (repeat === 'MONTH_WEEKDAY' ? day.getMonth() === baseMonth : day.getFullYear() === baseYear) {
        dates.push(datesForDay(day, base.start, base.end))
        day.setDate(day.getDate() + 7)
    }
    return dates
}
