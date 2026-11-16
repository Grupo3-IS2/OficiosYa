import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { DatesSetArg, EventApi, EventInput } from '@fullcalendar/core'
import { getProfessionalSchedule } from '../../../services/scheduleService'
import type { Schedule } from '../../../types/Schedule'
import { rescheduleDraftFrom, rescheduleTimeframe, type RescheduleDraft } from '../../Requests/rescheduleForm'
import { withinAvailability } from '../../Requests/requestResponse'
import { currentWeek } from '../scheduleCalendar'
import './BookingCalendar.css'

const COMPACT_QUERY = '(max-width: 760px)'
const WEEK_VIEW = 'timeGridWeek'
const COMPACT_VIEW = 'timeGridThreeDay'

const dateFormatter = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFormatter = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit' })

// FullCalendar recalculates the visible range whenever one of these objects changes, so they must keep their identity
const plugins = [timeGridPlugin, interactionPlugin]
const views = { [COMPACT_VIEW]: { type: 'timeGrid', duration: { days: 3 } } }
const headerToolbar = { left: 'prev,next', center: 'title', right: 'today' }
const hourFormat = { hour: '2-digit', minute: '2-digit', hour12: false } as const
const dayHeaderFormat = { weekday: 'short', day: 'numeric' } as const

/** The draft holds a single date, so a choice can't cross midnight; and it has to be ahead. */
function allowedChoice({ start, end }: { start: Date; end: Date }): boolean {
    return start >= new Date() && start.toDateString() === end.toDateString()
}

/** Free time and the professional's available blocks can be chosen; their jobs and time off can't. */
function canOverlap(event: EventApi): boolean {
    return event.extendedProps.available === true
}

interface BookingCalendarProps {
    professionalId: string
    value: RescheduleDraft
    onChange: (value: RescheduleDraft) => void
    /** The professional looking at their own agenda to book the job, rather than a client suggesting a time. */
    owner?: boolean
    disabled?: boolean
    /** Only shows the agenda and the chosen time, with nothing to change. */
    readOnly?: boolean
}

/** The professional's agenda, where the time for the job is dragged out. */
export default function BookingCalendar({ professionalId, value, onChange, owner = false, disabled = false, readOnly = false }: Readonly<BookingCalendarProps>) {
    const calendar = useRef<FullCalendar>(null)
    const [validRange] = useState(() => ({ start: currentWeek().start }))
    // A string, not Dates: setting the same range again must not trigger another fetch
    const [visibleRange, setVisibleRange] = useState('')
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const locked = disabled || readOnly
    const timeframe = rescheduleTimeframe(value)
    const choice = 'start' in timeframe ? timeframe : null

    useEffect(() => {
        if (!visibleRange) return
        const [from, to] = visibleRange.split('|').map(time => new Date(Number(time)))
        let active = true
        void getProfessionalSchedule(professionalId, from, to, owner)
            .then(response => { if (active) { setSchedules(response); setError(false) } })
            .catch(() => { if (active) setError(true) })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [professionalId, visibleRange, owner])

    useEffect(() => {
        const media = window.matchMedia(COMPACT_QUERY)
        const switchView = () => calendar.current?.getApi().changeView(media.matches ? COMPACT_VIEW : WEEK_VIEW)
        media.addEventListener('change', switchView)
        return () => media.removeEventListener('change', switchView)
    }, [])

    // A date typed by hand brings its week into view; one chosen on the calendar is already there
    const choiceStart = choice?.start.getTime()
    const choiceEnd = choice?.end.getTime()
    useEffect(() => {
        const api = calendar.current?.getApi()
        if (!api || choiceStart === undefined) return
        if (choiceStart < api.view.activeStart.getTime() || choiceStart >= api.view.activeEnd.getTime()) api.gotoDate(choiceStart)
    }, [choiceStart])

    const events = useMemo<EventInput[]>(() => [
        { id: 'elapsed', start: validRange.start, end: new Date(), display: 'background', classNames: ['booking-elapsed'] },
        ...schedules.map(schedule => {
            const available = schedule.type === 'URGENT_AVAILABLE'
            return {
                id: `${schedule.id}-${schedule.startTimestamp}`,
                title: available ? 'Disponible' : 'Ocupado',
                start: schedule.startTimestamp,
                end: schedule.endTimestamp,
                display: 'background',
                extendedProps: { available },
                classNames: [available ? 'booking-slot--available' : 'booking-slot--busy'],
            }
        }),
        ...(choiceStart !== undefined && choiceEnd !== undefined ? [{
            id: 'choice',
            title: owner ? 'Este trabajo' : 'Tu horario',
            start: choiceStart,
            end: choiceEnd,
            editable: !locked,
            classNames: ['booking-choice'],
        }] : []),
    ], [schedules, validRange, choiceStart, choiceEnd, owner, locked])

    function choose(start: Date, end: Date) {
        onChange(rescheduleDraftFrom(start.toISOString(), end.toISOString()))
    }

    function showRange(range: DatesSetArg) {
        const next = `${range.start.getTime()}|${range.end.getTime()}`
        if (next === visibleRange) return
        setLoading(true)
        setVisibleRange(next)
    }

    const fits = choice && withinAvailability(schedules, choice.start, choice.end)

    return <div className="booking-calendar">
        <div className="booking-calendar__legend" aria-hidden="true">
            <span><i className="booking-calendar__swatch booking-calendar__swatch--available" /> Disponible</span>
            <span><i className="booking-calendar__swatch booking-calendar__swatch--busy" /> Ocupado</span>
            <span><i className="booking-calendar__swatch booking-calendar__swatch--choice" /> {owner ? 'Este trabajo' : 'Tu horario'}</span>
        </div>
        <div className="booking-calendar__frame" aria-busy={loading}>
            <FullCalendar
                ref={calendar}
                plugins={plugins}
                locale={esLocale}
                initialView={window.matchMedia(COMPACT_QUERY).matches ? COMPACT_VIEW : WEEK_VIEW}
                views={views}
                headerToolbar={headerToolbar}
                validRange={validRange}
                height={430}
                scrollTime="08:00:00"
                allDaySlot={false}
                nowIndicator
                slotDuration="00:30:00"
                snapDuration="00:15:00"
                slotLabelFormat={hourFormat}
                eventTimeFormat={hourFormat}
                dayHeaderFormat={dayHeaderFormat}
                selectable={!locked}
                selectMirror
                unselectAuto={false}
                selectLongPressDelay={250}
                eventLongPressDelay={250}
                selectOverlap={canOverlap}
                eventOverlap={canOverlap}
                selectAllow={allowedChoice}
                eventAllow={allowedChoice}
                events={events}
                select={selection => {
                    selection.view.calendar.unselect()
                    choose(selection.start, selection.end)
                }}
                eventChange={change => {
                    if (change.event.start && change.event.end) choose(change.event.start, change.event.end)
                }}
                datesSet={showRange}
            />
            <div className={`booking-calendar__loading${loading ? ' is-visible' : ''}`} role="status" aria-hidden={!loading}>
                <span className="booking-calendar__spinner" aria-hidden="true" />
                {loading && 'Cargando agenda...'}
            </div>
        </div>

        {error && <p className="booking-calendar__note" role="status">No pudimos cargar la agenda.{!readOnly && ' Igual podés escribir el horario abajo.'}</p>}
        {choice
            ? <div className={`booking-calendar__summary${fits ? ' is-available' : ''}`} role="status">
                <div>
                    <strong>{dateFormatter.format(choice.start)}</strong>
                    <span>de {timeFormatter.format(choice.start)} a {timeFormatter.format(choice.end)}</span>
                    <small>{fits
                        ? `Dentro de ${owner ? 'tu' : 'su'} horario disponible.`
                        : owner
                            ? 'Fuera de tu horario disponible: te vamos a pedir que lo confirmes.'
                            : 'Fuera de su horario disponible: puede que te proponga otro.'}</small>
                </div>
                {!readOnly && <button type="button" disabled={disabled} onClick={() => onChange({ date: '', startTime: '', endTime: '' })}>Quitar</button>}
            </div>
            : !readOnly && <p className="booking-calendar__note">
                Arrastrá sobre el calendario para marcar cuándo {owner ? 'vas a hacer' : 'te gustaría'} el trabajo (en el celular, mantené presionado). Después podés moverlo o estirarlo.
            </p>}
    </div>
}
