import { useEffect, useState } from 'react'

const monthFormatter = new Intl.DateTimeFormat('es-UY', { month: 'long', year: 'numeric' })
const selectedDateFormatter = new Intl.DateTimeFormat('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
})
const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function dateValue(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function valueDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

export default function ScheduleDatePicker({ value, onChange }: Readonly<{
    value: string
    onChange: (value: string) => void
}>) {
    const selectedDate = valueDate(value)
    const [open, setOpen] = useState(false)
    const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))

    useEffect(() => {
        if (!open) return
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', closeOnEscape)
        return () => window.removeEventListener('keydown', closeOnEscape)
    }, [open])

    function openCalendar() {
        setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
        setOpen(true)
    }

    function moveMonth(offset: number) {
        setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1))
    }

    const firstDayOffset = (visibleMonth.getDay() + 6) % 7
    const monthDays = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
    const cells = Array.from({ length: firstDayOffset + monthDays }, (_, index) => {
        const day = index - firstDayOffset + 1
        return day > 0 ? day : null
    })

    return <>
        <button type="button" className="schedule-date-trigger" onClick={openCalendar} aria-haspopup="dialog">
            {selectedDateFormatter.format(selectedDate)}
            <span aria-hidden="true">▾</span>
        </button>

        {open && <div className="schedule-date-modal" role="presentation" onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false)
        }}>
            <div className="schedule-calendar" role="dialog" aria-modal="true" aria-labelledby="schedule-calendar-title">
                <div className="schedule-calendar__heading">
                    <button type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior">‹</button>
                    <strong id="schedule-calendar-title">{monthFormatter.format(visibleMonth)}</strong>
                    <button type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente">›</button>
                </div>
                <div className="schedule-calendar__grid">
                    {weekDays.map(day => <span className="schedule-calendar__weekday" key={day}>{day}</span>)}
                    {cells.map((day, index) => day === null
                        ? <span key={`empty-${index}`} />
                        : <button
                            type="button"
                            className={visibleMonth.getFullYear() === selectedDate.getFullYear()
                                && visibleMonth.getMonth() === selectedDate.getMonth()
                                && day === selectedDate.getDate() ? 'is-selected' : ''}
                            key={day}
                            onClick={() => {
                                onChange(dateValue(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)))
                                setOpen(false)
                            }}
                        >{day}</button>)}
                </div>
                <button type="button" className="schedule-calendar__close" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
        </div>}
    </>
}
