import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../components/Button/Button'
import { clock, dateKey, dayOfWeekOf, everyDay, rangeOn, suggestedRange } from '../scheduleEditor'
import type { TimeRange } from '../scheduleEditor'
import { Switch } from './ScheduleEditPanel'
import './ScheduleEditPanel.css'

/** A new block: its day, hours and whether it repeats. Opened by the + button or by selecting on the calendar. */
export default function ScheduleAddPanel({ initial, now, busy, error, onSave, onClose }: Readonly<{
    /** The hours the form opens with: a selection on the calendar, or a suggestion. */
    initial: TimeRange
    /** Moves every minute: what's before it can't be added. */
    now: number
    busy: boolean
    error: string
    onSave: (range: TimeRange, repeats: boolean) => void
    onClose: () => void
}>) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [date, setDate] = useState(dateKey(initial.start))
    const [startTime, setStartTime] = useState(clock(initial.start))
    const [endTime, setEndTime] = useState(clock(initial.end))
    const [repeats, setRepeats] = useState(false)

    useEffect(() => {
        const previousFocus = document.activeElement
        const element = dialog.current!
        const previousOverflow = document.body.style.overflow
        element.showModal()
        document.body.style.overflow = 'hidden'
        return () => {
            element.close()
            document.body.style.overflow = previousOverflow
            if (previousFocus instanceof HTMLElement) previousFocus.focus()
        }
    }, [])

    const [year, month, dayOfMonth] = date.split('-').map(Number)
    const chosenDay = date ? new Date(year, month - 1, dayOfMonth) : null
    const range = chosenDay ? rangeOn(chosenDay, startTime, endTime) : null
    const past = range !== null && range.start.getTime() < now
    const canSave = range !== null && !past && !busy

    /** On a day where the hours typed already passed (today), offers future ones instead. */
    function changeDate(value: string) {
        setDate(value)
        const [newYear, newMonth, newDay] = value.split('-').map(Number)
        const typed = value ? rangeOn(new Date(newYear, newMonth - 1, newDay), startTime, endTime) : null
        if (!typed || typed.start.getTime() >= now) return
        const next = suggestedRange(typed.start, new Date(now))
        setDate(dateKey(next.start))
        setStartTime(clock(next.start))
        setEndTime(clock(next.end))
    }

    const hint = range === null
        ? 'La hora de fin tiene que ser posterior a la de inicio. 00:00 es medianoche.'
        : past ? 'Ese horario ya pasó: elegí uno desde ahora.' : ''

    return createPortal(
        <dialog ref={dialog} className="schedule-edit" aria-labelledby="schedule-add-title" aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
            <form className="schedule-edit__body" onSubmit={event => {
                event.preventDefault()
                if (canSave) onSave(range, repeats)
            }}>
                <header className="schedule-edit__header">
                    <h2 id="schedule-add-title">Agregar horario</h2>
                    <button type="button" className="schedule-edit__close" onClick={onClose} disabled={busy} aria-label="Cerrar">×</button>
                </header>

                <fieldset className="schedule-edit__hours" disabled={busy}>
                    <legend>Día y horario</legend>
                    <label className="schedule-edit__day">Día<input type="date" min={dateKey(new Date(now))} value={date} onChange={event => changeDate(event.target.value)} required /></label>
                    <label>Desde<input type="time" step={900} value={startTime} onChange={event => setStartTime(event.target.value)} required /></label>
                    <span aria-hidden="true">–</span>
                    <label>Hasta<input type="time" step={900} value={endTime} onChange={event => setEndTime(event.target.value)} required /></label>
                    {hint && <small className="is-error">{hint}</small>}
                </fieldset>

                <Switch
                    checked={repeats}
                    onChange={setRepeats}
                    disabled={busy || !chosenDay}
                    label={chosenDay ? `Se repite ${everyDay(dayOfWeekOf(chosenDay))}` : 'Se repite cada semana'}
                    hint={repeats ? 'Si algún día no podés, lo desactivás desde el calendario.' : 'Encendelo para que se repita cada semana.'}
                />

                {error && <p className="schedule-edit__error" role="alert">{error}</p>}

                <div className="schedule-edit__actions">
                    <button type="button" className="schedule-edit__secondary" onClick={onClose} disabled={busy}>Cancelar</button>
                    <Button type="submit" disabled={!canSave}>{busy ? 'Guardando…' : 'Agregar'}</Button>
                </div>
            </form>
        </dialog>,
        document.body,
    )
}
