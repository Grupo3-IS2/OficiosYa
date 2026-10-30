import type { DayOfWeek, Schedule, WeeklyAvailability } from '../../types/Schedule'

export interface TimeRange {
    start: Date
    end: Date
}

/** How a new block is saved: as its own block, or by stretching an adjacent one so the agenda stays tidy. */
export type CreationPlan =
    | { kind: 'create'; start: Date; end: Date }
    | { kind: 'extend'; id: number; start: Date; end: Date; absorbedId: number | null }

/** Indexed like Date.getDay(): Sunday first. */
const daysByIndex: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

/** Read after "todos los": todos los lunes, todos los sábados. */
const plurals: Record<DayOfWeek, string> = {
    MONDAY: 'lunes',
    TUESDAY: 'martes',
    WEDNESDAY: 'miércoles',
    THURSDAY: 'jueves',
    FRIDAY: 'viernes',
    SATURDAY: 'sábados',
    SUNDAY: 'domingos',
}

export function rangeOf(schedule: Schedule): TimeRange {
    return { start: new Date(schedule.startTimestamp), end: new Date(schedule.endTimestamp) }
}

/** One-off availability: repeating blocks are never stretched by a one-off one. */
function storedAvailability(schedules: Schedule[]): (TimeRange & { id: number })[] {
    return schedules
        .filter(schedule => schedule.type === 'URGENT_AVAILABLE' && schedule.rrule === null)
        .map(schedule => ({ id: schedule.id, ...rangeOf(schedule) }))
}

export function planCreation(range: TimeRange, schedules: Schedule[]): CreationPlan {
    const available = storedAvailability(schedules)
    const before = available.find(block => block.end.getTime() === range.start.getTime())
    const after = available.find(block => block.start.getTime() === range.end.getTime())

    if (before) {
        return { kind: 'extend', id: before.id, start: before.start, end: after ? after.end : range.end, absorbedId: after ? after.id : null }
    }
    if (after) return { kind: 'extend', id: after.id, start: range.start, end: after.end, absorbedId: null }
    return { kind: 'create', start: range.start, end: range.end }
}

/** Days since the epoch of a local date, so a change of time (DST) doesn't move it. */
function dayNumber(date: Date): number {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
}

/**
 * Where the first occurrence of a repeating block goes when one of its occurrences changes: as many days later
 * or earlier as that one moved, at its new hours. The block is stored by its first occurrence.
 */
export function movedSeries(first: TimeRange, occurrence: TimeRange, changed: TimeRange): TimeRange {
    const days = dayNumber(changed.start) - dayNumber(occurrence.start)
    const start = new Date(first.start.getFullYear(), first.start.getMonth(), first.start.getDate() + days,
        changed.start.getHours(), changed.start.getMinutes())
    return { start, end: new Date(start.getTime() + changed.end.getTime() - changed.start.getTime()) }
}

function pad(value: number): string {
    return String(value).padStart(2, '0')
}

/** "HH:mm" in local time. */
export function clock(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const QUARTER = 15 * 60_000
const SUGGESTED_HOURS = 4

/**
 * Hours to offer for a new block on that day: 09:00 to 13:00, or from the next quarter of an hour when that
 * already passed, for four hours or until midnight. Late at night that is the next day.
 */
export function suggestedRange(day: Date, now: Date): TimeRange {
    const morning = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9)
    const start = morning > now ? morning : new Date((Math.floor(now.getTime() / QUARTER) + 1) * QUARTER)
    const midnight = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours() + SUGGESTED_HOURS, start.getMinutes())
    return { start, end: end < midnight ? end : midnight }
}

/** "YYYY-MM-DD" in local time. */
export function dateKey(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Whether a block starts and ends on the same day (ending at midnight counts), so it can be edited as hours. */
export function withinOneDay(range: TimeRange): boolean {
    return weeklySlotFor(range) !== null
}

/**
 * The range from startTime to endTime ("HH:mm") on the day of `day`, where an end of 00:00 means midnight.
 * Null when the end isn't after the start.
 */
export function rangeOn(day: Date, startTime: string, endTime: string): TimeRange | null {
    const at = (time: string, extraDays = 0) => {
        const [hours, minutes] = time.split(':').map(Number)
        return new Date(day.getFullYear(), day.getMonth(), day.getDate() + extraDays, hours, minutes)
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null
    const start = at(startTime)
    const end = endTime === '00:00' ? at(endTime, 1) : at(endTime)
    return start < end ? { start, end } : null
}

/**
 * The slot of the usual week that repeats a range every week, or null when the range spans more than one
 * day. A range that ends at midnight ends at 00:00.
 */
export function weeklySlotFor(range: TimeRange): WeeklyAvailability | null {
    const nextMidnight = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + 1)
    const sameDay = range.end.toDateString() === range.start.toDateString()
    if (!sameDay && range.end.getTime() !== nextMidnight.getTime()) return null

    return { dayOfWeek: daysByIndex[range.start.getDay()], startTime: clock(range.start), endTime: clock(range.end) }
}

export function everyDay(day: DayOfWeek): string {
    return `todos los ${plurals[day]}`
}

export function dayOfWeekOf(date: Date): DayOfWeek {
    return daysByIndex[date.getDay()]
}

/** "09:00 a 18:00", showing an end of midnight as 24:00. */
export function slotHours(slot: Pick<WeeklyAvailability, 'startTime' | 'endTime'>): string {
    const end = slot.endTime.slice(0, 5)
    return `${slot.startTime.slice(0, 5)} a ${end === '00:00' ? '24:00' : end}`
}
