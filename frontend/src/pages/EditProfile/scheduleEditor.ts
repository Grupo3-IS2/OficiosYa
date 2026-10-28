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

/** The whole availability block a piece belongs to: jobs and time off may have cut it in several pieces. */
export function wholeBlock(schedule: Schedule): TimeRange {
    return {
        start: new Date(schedule.blockStartTimestamp ?? schedule.startTimestamp),
        end: new Date(schedule.blockEndTimestamp ?? schedule.endTimestamp),
    }
}

/** One-off availability, once per block even when it comes in pieces. */
function storedAvailability(schedules: Schedule[]): (TimeRange & { id: number })[] {
    const blocks = new Map<number, TimeRange & { id: number }>()
    schedules.forEach(schedule => {
        if (schedule.type === 'URGENT_AVAILABLE' && schedule.id !== null) blocks.set(schedule.id, { id: schedule.id, ...wholeBlock(schedule) })
    })
    return [...blocks.values()]
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

/**
 * The whole block after one of its pieces was moved or stretched: the edges of the block move as much as the
 * edges of the piece did. The calendar only lets a piece move when it is the whole block, and only lets its end
 * stretch when that end is the end of the block.
 */
export function changedBlock(block: TimeRange, piece: TimeRange, changedPiece: TimeRange): TimeRange {
    return {
        start: new Date(block.start.getTime() + changedPiece.start.getTime() - piece.start.getTime()),
        end: new Date(block.end.getTime() + changedPiece.end.getTime() - piece.end.getTime()),
    }
}

/** Parts of the range not covered by any of the others. */
export function without(range: TimeRange, others: TimeRange[]): TimeRange[] {
    let pieces = [range]
    others.forEach(other => {
        pieces = pieces.flatMap(piece => {
            if (other.end <= piece.start || other.start >= piece.end) return [piece]
            return [
                ...(other.start > piece.start ? [{ start: piece.start, end: other.start }] : []),
                ...(other.end < piece.end ? [{ start: other.end, end: piece.end }] : []),
            ]
        })
    })
    return pieces
}

/** One-off availability blocks, whole, so the usual week can be turned into one-off blocks without clashing. */
export function oneOffBlocks(schedules: Schedule[]): TimeRange[] {
    return storedAvailability(schedules).map(({ start, end }) => ({ start, end }))
}

function pad(value: number): string {
    return String(value).padStart(2, '0')
}

/** "HH:mm" in local time. */
export function clock(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
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
export function weeklySlotFor(range: TimeRange): Omit<WeeklyAvailability, 'id'> | null {
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
