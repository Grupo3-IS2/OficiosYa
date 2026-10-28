import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../components/Button/Button'
import type { Schedule } from '../../../types/Schedule'
import { clock, dayOfWeekOf, everyDay, rangeOf, rangeOn, withinOneDay } from '../scheduleEditor'
import type { TimeRange } from '../scheduleEditor'
import './ScheduleEditPanel.css'

export interface ScheduleEdit {
    active: boolean
    range: TimeRange
    repeats: boolean
}

const dayFormatter = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })
const shortDayFormatter = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric' })

export function Switch({ checked, onChange, disabled, label, hint }: Readonly<{
    checked: boolean
    onChange: (checked: boolean) => void
    disabled?: boolean
    label: string
    hint: string
}>) {
    return <label className={`schedule-switch${disabled ? ' is-disabled' : ''}`}>
        <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
        <span className="schedule-switch__track" aria-hidden="true" />
        <span className="schedule-switch__text">
            <strong>{label}</strong>
            <small>{hint}</small>
        </span>
    </label>
}

/**
 * What can be done with a block from the calendar: change its hours, turn it off for that day, make it repeat
 * or not, and delete it. A block that is off (time off) can only be turned back on.
 */
export default function ScheduleEditPanel({ schedule, busy, error, onSave, onDeleteDay, onDeleteAll, onClose }: Readonly<{
    schedule: Schedule
    busy: boolean
    error: string
    onSave: (edit: ScheduleEdit) => void
    onDeleteDay: () => void
    onDeleteAll: () => void
    onClose: () => void
}>) {
    const dialog = useRef<HTMLDialogElement>(null)
    const block = rangeOf(schedule)
    const isOff = schedule.type === 'USER_RESERVED'
    const isWeekly = schedule.rrule !== null
    const oneDay = withinOneDay(block)
    const every = everyDay(dayOfWeekOf(block.start))

    const [active, setActive] = useState(!isOff)
    const [startTime, setStartTime] = useState(clock(block.start))
    const [endTime, setEndTime] = useState(clock(block.end))
    const [repeats, setRepeats] = useState(isWeekly)

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

    const range = oneDay ? rangeOn(block.start, startTime, endTime) : block
    const changed = active !== !isOff || repeats !== isWeekly || startTime !== clock(block.start) || endTime !== clock(block.end)
    const canSave = changed && !busy && (range !== null || !active)

    function save() {
        if (!canSave) return
        onSave({ active, range: range ?? block, repeats })
    }

    const hoursHint = !active
        ? 'Este día vas a figurar como no disponible.'
        : repeats && isWeekly ? `El cambio se aplica a ${every}.` : 'Solo este día.'

    return createPortal(
        <dialog ref={dialog} className="schedule-edit" aria-labelledby="schedule-edit-title" aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
            <form className="schedule-edit__body" onSubmit={event => { event.preventDefault(); save() }}>
                <header className="schedule-edit__header">
                    <div>
                        <h2 id="schedule-edit-title">{isOff ? 'Horario desactivado' : 'Editar horario'}</h2>
                        <p>{dayFormatter.format(block.start)}{isWeekly && <span className="schedule-edit__badge">↻ {every}</span>}</p>
                    </div>
                    <button type="button" className="schedule-edit__close" onClick={onClose} disabled={busy} aria-label="Cerrar">×</button>
                </header>

                <Switch
                    checked={active}
                    onChange={setActive}
                    disabled={busy}
                    label="Disponible este día"
                    hint={isOff
                        ? 'Activalo para volver a figurar disponible en este horario.'
                        : 'Desactivalo si este día no vas a trabajar. Las demás semanas no cambian.'}
                />

                {!isOff && <>
                    <fieldset className="schedule-edit__hours" disabled={busy || !active || !oneDay}>
                        <legend>Horario</legend>
                        <label>Desde<input type="time" step={900} value={startTime} onChange={event => setStartTime(event.target.value)} required /></label>
                        <span aria-hidden="true">–</span>
                        <label>Hasta<input type="time" step={900} value={endTime} onChange={event => setEndTime(event.target.value)} required /></label>
                        <small className={active && oneDay && range === null ? 'is-error' : ''}>
                            {!oneDay
                                ? 'Este horario ocupa más de un día: para cambiarlo, estiralo en el calendario.'
                                : active && range === null ? 'La hora de fin tiene que ser posterior a la de inicio. 00:00 es medianoche.' : hoursHint}
                        </small>
                    </fieldset>

                    <Switch
                        checked={repeats}
                        onChange={setRepeats}
                        disabled={busy || !active || !oneDay}
                        label={`Se repite ${every}`}
                        hint={repeats
                            ? isWeekly ? 'Apagalo para que quede solo este día.' : `Desde ahora vas a figurar disponible ${every}.`
                            : isWeekly ? `Deja de repetirse: queda solo el ${shortDayFormatter.format(block.start)}.` : 'Encendelo para que se repita cada semana.'}
                    />
                </>}

                {error && <p className="schedule-edit__error" role="alert">{error}</p>}

                <div className="schedule-edit__actions">
                    <button type="button" className="schedule-edit__secondary" onClick={onClose} disabled={busy}>Cancelar</button>
                    <Button type="submit" disabled={!canSave}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
                </div>

                {!isOff && <div className="schedule-edit__danger">
                    <strong>Eliminar</strong>
                    {isWeekly
                        ? <div>
                            <button type="button" onClick={onDeleteDay} disabled={busy}>Solo el {shortDayFormatter.format(block.start)}</button>
                            <button type="button" onClick={onDeleteAll} disabled={busy}>{every.charAt(0).toUpperCase() + every.slice(1)}</button>
                        </div>
                        : <div><button type="button" onClick={onDeleteAll} disabled={busy}>Eliminar este horario</button></div>}
                </div>}
            </form>
        </dialog>,
        document.body,
    )
}
