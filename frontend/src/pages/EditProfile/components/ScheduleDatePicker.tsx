import { useEffect, useState } from 'react'

const monthFormatter = new Intl.DateTimeFormat('es-UY', { month: 'long', year: 'numeric' })
const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function sameDay(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
        && first.getMonth() === second.getMonth()
        && first.getDate() === second.getDate()
}

/** Month calendar in a modal to jump to any day; days before min can't be picked. */
export default function ScheduleDatePicker({ value, min, onChange, onClose }: Readonly<{
    value: Date
    min: Date
    onChange: (value: Date) => void
    onClose: () => void
}>) {
    const [visibleMonth, setVisibleMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1))
    const firstDay = new Date(min.getFullYear(), min.getMonth(), min.getDate())
    const today = new Date()

    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', closeOnEscape)
        return () => window.removeEventListener('keydown', closeOnEscape)
    }, [onClose])

    function moveMonth(offset: number) {
        setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1))
    }

    const firstDayOffset = (visibleMonth.getDay() + 6) % 7
    const monthDays = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
    const cells = Array.from({ length: firstDayOffset + monthDays }, (_, index) => {
        const day = index - firstDayOffset + 1
        return day > 0 ? new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day) : null
    })
    const canGoBack = visibleMonth > firstDay

    return <div className="schedule-date-modal" role="presentation" onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
    }}>
        <div className="schedule-calendar" role="dialog" aria-modal="true" aria-labelledby="schedule-calendar-title">
            <div className="schedule-calendar__heading">
                <button type="button" onClick={() => moveMonth(-1)} disabled={!canGoBack} aria-label="Mes anterior">‹</button>
                <strong id="schedule-calendar-title">{monthFormatter.format(visibleMonth)}</strong>
                <button type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente">›</button>
            </div>
            <div className="schedule-calendar__grid">
                {weekDays.map(day => <span className="schedule-calendar__weekday" key={day}>{day}</span>)}
                {cells.map((date, index) => date === null
                    ? <span key={`empty-${index}`} />
                    : <button
                        type="button"
                        className={[sameDay(date, value) ? 'is-selected' : '', sameDay(date, today) ? 'is-today' : ''].join(' ').trim()}
                        key={date.getDate()}
                        disabled={date < firstDay}
                        onClick={() => onChange(date)}
                    >{date.getDate()}</button>)}
            </div>
            <button type="button" className="schedule-calendar__close" onClick={onClose}>Cerrar</button>
        </div>
    </div>
}
