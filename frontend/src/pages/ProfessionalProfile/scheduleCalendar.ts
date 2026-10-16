import type { Schedule, ScheduleType } from '../../types/Schedule'

export type CalendarBlockKind = 'available' | 'busy'

export interface CalendarBlock {
    key: string
    day: number
    startHour: number
    endHour: number
    kind: CalendarBlockKind
}

export interface WeekRange {
    start: Date
    end: Date
}

export function currentWeek(reference = new Date()): WeekRange {
    const start = new Date(reference)
    const daysSinceMonday = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - daysSinceMonday)
    start.setHours(0, 0, 0, 0)

    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
}

function blockKind(type: ScheduleType): CalendarBlockKind {
    return type === 'URGENT_AVAILABLE' ? 'available' : 'busy'
}

function hourOfDay(date: Date): number {
    return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

export function calendarBlocks(schedules: Schedule[], week: WeekRange): CalendarBlock[] {
    const blocks: CalendarBlock[] = []

    schedules.forEach(schedule => {
        const scheduleStart = new Date(schedule.startTimestamp)
        const scheduleEnd = new Date(schedule.endTimestamp)
        if (!Number.isFinite(scheduleStart.getTime()) || !Number.isFinite(scheduleEnd.getTime()) || scheduleStart >= scheduleEnd) return

        for (let day = 0; day < 7; day++) {
            const dayStart = new Date(week.start)
            dayStart.setDate(dayStart.getDate() + day)
            const dayEnd = new Date(dayStart)
            dayEnd.setDate(dayEnd.getDate() + 1)

            const clippedStart = new Date(Math.max(scheduleStart.getTime(), dayStart.getTime()))
            const clippedEnd = new Date(Math.min(scheduleEnd.getTime(), dayEnd.getTime()))
            if (clippedStart >= clippedEnd) continue

            blocks.push({
                key: `${schedule.id}-${day}`,
                day,
                startHour: clippedStart.getTime() === dayStart.getTime() ? 0 : hourOfDay(clippedStart),
                endHour: clippedEnd.getTime() === dayEnd.getTime() ? 24 : hourOfDay(clippedEnd),
                kind: blockKind(schedule.type),
            })
        }
    })

    return blocks
}
