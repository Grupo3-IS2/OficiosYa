import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'

type PickerStep = 'hour' | 'minute'

const clockHours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const clockMinutes = [0, 15, 30, 45]

function pad(value: number): string {
    return String(value).padStart(2, '0')
}

function parseTime(value: string): { hour: number; minute: number } {
    const [hour, minute] = value.split(':').map(Number)
    return { hour, minute }
}

export default function ScheduleTimePicker({ label, value, onChange }: Readonly<{
    label: string
    value: string
    onChange: (value: string) => void
}>) {
    const current = parseTime(value)
    const titleId = useId()
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<PickerStep>('hour')
    const [hour, setHour] = useState(current.hour)
    const [minute, setMinute] = useState(current.minute)

    useEffect(() => {
        if (!open) return
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', closeOnEscape)
        return () => window.removeEventListener('keydown', closeOnEscape)
    }, [open])

    function openClock() {
        const selected = parseTime(value)
        setHour(selected.hour)
        setMinute(selected.minute)
        setStep('hour')
        setOpen(true)
    }

    function selectHour(selectedHour: number) {
        const isAfternoon = hour >= 12
        setHour((selectedHour % 12) + (isAfternoon ? 12 : 0))
        setStep('minute')
    }

    function setPeriod(period: 'AM' | 'PM') {
        setHour(currentHour => period === 'PM'
            ? currentHour % 12 + 12
            : currentHour % 12)
    }

    const displayHour = hour % 12 || 12

    return <>
        <button type="button" className="schedule-time-trigger" onClick={openClock} aria-haspopup="dialog">
            {value}
            <span aria-hidden="true">▾</span>
        </button>

        {open && <div className="schedule-time-modal" role="presentation" onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false)
        }}>
            <div className="schedule-clock" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <h3 id={titleId}>{label}</h3>
                <div className="schedule-clock__display" aria-label={`Hora seleccionada ${pad(hour)}:${pad(minute)}`}>
                    <button type="button" className={step === 'hour' ? 'is-active' : ''} onClick={() => setStep('hour')}>{pad(hour)}</button>
                    <span>:</span>
                    <button type="button" className={step === 'minute' ? 'is-active' : ''} onClick={() => setStep('minute')}>{pad(minute)}</button>
                </div>
                <div className="schedule-clock__period" aria-label="Período del día">
                    <button type="button" className={hour < 12 ? 'is-active' : ''} onClick={() => setPeriod('AM')}>AM</button>
                    <button type="button" className={hour >= 12 ? 'is-active' : ''} onClick={() => setPeriod('PM')}>PM</button>
                </div>
                <div className="schedule-clock__face" aria-label={step === 'hour' ? 'Elegir hora' : 'Elegir minutos'}>
                    {step === 'hour'
                        ? clockHours.map((clockHour, index) => <button
                            type="button"
                            className={displayHour === clockHour ? 'is-selected' : ''}
                            style={{ '--clock-angle': `${index * 30}deg` } as CSSProperties}
                            onClick={() => selectHour(clockHour)}
                            key={clockHour}
                        >{clockHour}</button>)
                        : clockMinutes.map((clockMinute, index) => <button
                            type="button"
                            className={minute === clockMinute ? 'is-selected' : ''}
                            style={{ '--clock-angle': `${index * 90}deg` } as CSSProperties}
                            onClick={() => setMinute(clockMinute)}
                            key={clockMinute}
                        >{pad(clockMinute)}</button>)}
                    <span className="schedule-clock__pin" aria-hidden="true" />
                </div>
                <div className="schedule-clock__actions">
                    <button type="button" onClick={() => setOpen(false)}>Cancelar</button>
                    <button type="button" onClick={() => {
                        onChange(`${pad(hour)}:${pad(minute)}`)
                        setOpen(false)
                    }}>Aceptar</button>
                </div>
            </div>
        </div>}
    </>
}
