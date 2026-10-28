import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { DateSelectArg, DatesSetArg, EventChangeArg, EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core'
import {
    createAvailability,
    createTimeOff,
    deleteAvailability,
    getProfessionalSchedule,
    skipOccurrence,
    updateAvailability,
} from '../../../services/scheduleService'
import type { Schedule } from '../../../types/Schedule'
import { currentWeek } from '../../ProfessionalProfile/scheduleCalendar'
import { dayOfWeekOf, everyDay, movedSeries, planCreation, rangeOf, slotHours, suggestedRange, weeklySlotFor, withinOneDay } from '../scheduleEditor'
import type { TimeRange } from '../scheduleEditor'
import ScheduleAddPanel from './ScheduleAddPanel'
import ScheduleChoiceModal from './ScheduleChoiceModal'
import type { ScheduleChoice } from './ScheduleChoiceModal'
import ScheduleDatePicker from './ScheduleDatePicker'
import ScheduleDeleteModal from './ScheduleDeleteModal'
import ScheduleEditPanel from './ScheduleEditPanel'
import type { ScheduleEdit } from './ScheduleEditPanel'
import './ScheduleSection.css'

type ModalState =
    | { kind: 'choice'; title: string; description: string; choices: ScheduleChoice[] }
    | { kind: 'delete'; description: string; onConfirm: () => void; back?: ModalState }
    | { kind: 'edit'; schedule: Schedule }
    | { kind: 'add'; range: TimeRange }

const COMPACT_QUERY = '(max-width: 650px)'
const WEEK_VIEW = 'timeGridWeek'
const COMPACT_VIEW = 'timeGridThreeDay'

const dateFormatter = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFormatter = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit' })

// FullCalendar recalculates the visible range whenever one of these objects changes, so they must keep their identity
const plugins = [timeGridPlugin, interactionPlugin]
const views = { [COMPACT_VIEW]: { type: 'timeGrid', duration: { days: 3 } } }
const headerToolbar = { left: 'prev,next today pickDate', center: 'title', right: 'addBlock' }
const hourFormat = { hour: '2-digit', minute: '2-digit', hour12: false } as const
const dayHeaderFormat = { weekday: 'short', day: 'numeric' } as const

const blockTitles: Record<Schedule['type'], string> = {
    URGENT_AVAILABLE: 'Disponible',
    SCHEDULED_JOB: 'Trabajo agendado',
    USER_RESERVED: 'Desactivado',
}

/** Same markup as FullCalendar's own, plus a pencil on the blocks that open the edit panel. */
function eventContent(arg: EventContentArg) {
    const editable = arg.event.classNames.includes('schedule-event--clickable')
    return <div className="fc-event-main-frame">
        {arg.timeText && <div className="fc-event-time">{arg.timeText}</div>}
        <div className="fc-event-title-container">
            <div className="fc-event-title fc-sticky">{arg.event.title}</div>
        </div>
        {editable && <span className="schedule-event__edit" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
        </span>}
    </div>
}

function scheduleLabel({ start, end }: TimeRange): string {
    return `${dateFormatter.format(start)}, de ${timeFormatter.format(start)} a ${timeFormatter.format(end)}`
}

function errorMessage(reason: unknown, fallback: string): string {
    return reason instanceof Error ? reason.message : fallback
}

function eventId(schedule: Schedule): string {
    return `${schedule.id}-${schedule.startTimestamp}`
}

/** Marks the range as not available. shortcut: if it fails (e.g. it falls on a job), the day just stays empty; it can be added again by selecting it. */
async function markOff({ start, end }: TimeRange): Promise<void> {
    await createTimeOff(start, end).catch(() => undefined)
}

export default function ScheduleSection({ professionalId }: Readonly<{ professionalId: string }>) {
    const calendar = useRef<FullCalendar>(null)
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [validRange] = useState(() => ({ start: currentWeek().start }))
    // A string, not Dates: setting the same range again must not trigger another render
    const [visibleRange, setVisibleRange] = useState('')
    const [reloads, setReloads] = useState(0)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [modal, setModal] = useState<ModalState | null>(null)
    const [now, setNow] = useState(Date.now)
    const [pickerDate, setPickerDate] = useState<Date | null>(null)
    const [customButtons] = useState(() => ({
        pickDate: { text: 'Elegir día', click: () => setPickerDate(calendar.current?.getApi().getDate() ?? new Date()) },
        addBlock: { text: '+', hint: 'Agregar horario', click: () => {
            // Opens on the day on screen, or today when the calendar shows the current week
            const shown = calendar.current?.getApi().getDate() ?? new Date()
            setError('')
            setMessage('')
            setModal({ kind: 'add', range: suggestedRange(shown, new Date()) })
        } },
    }))

    // Moves the line that marks from when blocks can be added
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000)
        return () => window.clearInterval(timer)
    }, [])

    // The agenda comes with every occurrence of the repeating blocks in the range
    useEffect(() => {
        if (!visibleRange) return
        const [from, to] = visibleRange.split('|').map(value => new Date(Number(value)))
        let active = true
        void getProfessionalSchedule(professionalId, from, to, true)
            .then(response => { if (active) setSchedules(response) })
            .catch(() => { if (active) setError('No pudimos cargar tus horarios de atención.') })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [professionalId, visibleRange, reloads])

    useEffect(() => {
        const media = window.matchMedia(COMPACT_QUERY)
        const switchView = () => calendar.current?.getApi().changeView(media.matches ? COMPACT_VIEW : WEEK_VIEW)
        media.addEventListener('change', switchView)
        return () => media.removeEventListener('change', switchView)
    }, [])

    const events = useMemo<EventInput[]>(() => {
        const elapsed: EventInput = {
            id: 'elapsed',
            start: validRange.start,
            end: new Date(now),
            display: 'background',
            classNames: ['schedule-elapsed'],
        }
        return [elapsed, ...schedules.map(schedule => {
            const upcoming = new Date(schedule.endTimestamp).getTime() > now
            const available = schedule.type === 'URGENT_AVAILABLE'
            const canChange = available && upcoming && !busy
            return {
                id: eventId(schedule),
                title: blockTitles[schedule.type],
                start: schedule.startTimestamp,
                end: schedule.endTimestamp,
                startEditable: canChange,
                durationEditable: canChange,
                extendedProps: { schedule },
                classNames: [
                    available ? 'schedule-event--available' : 'schedule-event--busy',
                    schedule.rrule !== null ? 'schedule-event--weekly' : '',
                    upcoming && schedule.type !== 'SCHEDULED_JOB' ? 'schedule-event--clickable' : '',
                    upcoming ? '' : 'schedule-event--past',
                ],
            }
        })]
    }, [schedules, busy, now, validRange])

    /** Another week: covers the calendar until its blocks arrive, instead of showing the last week's ones. */
    function showRange(range: DatesSetArg) {
        const next = `${range.start.getTime()}|${range.end.getTime()}`
        if (next === visibleRange) return
        setLoading(true)
        setVisibleRange(next)
    }

    /** Runs a change and reloads the agenda: how availability shows depends on every other block. */
    async function run(action: () => Promise<unknown>, success: string, failure: string, keepOpenOnError = false) {
        setBusy(true)
        setError('')
        setMessage('')
        try {
            await action()
            setMessage(success)
            setModal(null)
        } catch (reason) {
            setError(errorMessage(reason, failure))
            // The edit panel shows the error, so the professional can fix what they typed
            if (!keepOpenOnError) setModal(null)
        } finally {
            setBusy(false)
            setReloads(count => count + 1)
        }
    }

    async function addOneOff(range: TimeRange) {
        const plan = planCreation(range, schedules)
        if (plan.kind === 'create') {
            await createAvailability(plan.start, plan.end)
            return
        }
        // The absorbed block has to go first, otherwise stretching over it counts as an overlap
        const absorbed = plan.absorbedId === null ? null : schedules.find(schedule => schedule.id === plan.absorbedId)
        if (absorbed) await deleteAvailability(absorbed.id)
        try {
            await updateAvailability(plan.id, plan.start, plan.end)
        } catch (reason) {
            if (absorbed) {
                const { start, end } = rangeOf(absorbed)
                await createAvailability(start, end)
            }
            throw reason
        }
    }

    function addTyped(range: TimeRange, repeats: boolean) {
        const slot = weeklySlotFor(range)
        void run(async () => {
            await (repeats ? createAvailability(range.start, range.end, true) : addOneOff(range))
            calendar.current?.getApi().gotoDate(range.start)
        }, repeats && slot ? `Listo: vas a figurar disponible ${everyDay(slot.dayOfWeek)} de ${slotHours(slot)}.` : 'Horario agregado.',
        'No pudimos agregar el horario.', true)
    }

    /** A selection opens the same form as the + button, with its day and hours. */
    function chooseHowToAdd(selection: DateSelectArg) {
        selection.view.calendar.unselect()
        const range = { start: selection.start, end: selection.end }
        setError('')
        setMessage('')
        if (withinOneDay(range)) {
            setModal({ kind: 'add', range })
            return
        }
        // The form holds a single day: a selection over several days can only be a one-off block
        setModal({
            kind: 'choice',
            title: 'Agregar horario',
            description: `Desde el ${dateFormatter.format(range.start)} a las ${timeFormatter.format(range.start)} hasta el ${dateFormatter.format(range.end)} a las ${timeFormatter.format(range.end)}. No se puede repetir cada semana porque ocupa más de un día.`,
            choices: [{
                label: 'Agregar este horario',
                onSelect: () => void run(() => addOneOff(range), 'Horario agregado.', 'No pudimos agregar el horario.'),
            }],
        })
    }

    /**
     * Puts the change in the state before saving it. Otherwise the next render (busy, saving) hands the calendar
     * the old position and the block jumps back until the agenda reloads. Returns how to undo it.
     */
    function showChange(schedule: Schedule, changed: TimeRange): () => void {
        const previous = schedules
        const key = eventId(schedule)
        setSchedules(current => current.map(other => eventId(other) === key
            ? { ...other, startTimestamp: changed.start.toISOString(), endTimestamp: changed.end.toISOString() }
            : other))
        return () => setSchedules(previous)
    }

    /**
     * Changes every week of a repeating block like this occurrence changed. The block is stored by its first
     * occurrence, which may be before the weeks on screen: the agenda from the start brings it.
     */
    async function changeEveryWeek(occurrence: Schedule, changed: TimeRange) {
        const agenda = await getProfessionalSchedule(professionalId, undefined, new Date(occurrence.endTimestamp), true)
        const first = agenda.find(other => other.id === occurrence.id) ?? occurrence
        const series = movedSeries(rangeOf(first), rangeOf(occurrence), changed)
        await updateAvailability(occurrence.id, series.start, series.end)
    }

    function changeBlock(change: EventChangeArg) {
        const schedule = change.event.extendedProps.schedule as Schedule
        const { start, end } = change.event
        if (!start || !end) {
            change.revert()
            return
        }
        const changed = { start, end }

        if (schedule.rrule === null) {
            const undo = showChange(schedule, changed)
            void run(async () => {
                try {
                    await updateAvailability(schedule.id, start, end)
                } catch (reason) {
                    undo()
                    throw reason
                }
            }, `Horario cambiado al ${scheduleLabel(changed)}.`, 'No pudimos cambiar el horario.')
            return
        }

        // Changing one occurrence of a repeating block changes every week; the message says so
        const slot = weeklySlotFor(changed)
        if (!slot) {
            change.revert()
            setError('Un horario que se repite tiene que empezar y terminar el mismo día.')
            return
        }
        const undo = showChange(schedule, changed)
        void run(async () => {
            try {
                await changeEveryWeek(schedule, changed)
            } catch (reason) {
                undo()
                throw reason
            }
        }, `Listo: ahora figurás disponible ${everyDay(slot.dayOfWeek)} de ${slotHours(slot)}.`, 'No pudimos cambiar el horario semanal.')
    }

    function openBlock(click: EventClickArg) {
        const schedule = click.event.extendedProps.schedule as Schedule | undefined
        if (!schedule || new Date(schedule.endTimestamp).getTime() <= now || schedule.type === 'SCHEDULED_JOB') return
        setError('')
        setMessage('')
        setModal({ kind: 'edit', schedule })
    }

    function saveEdit(schedule: Schedule, edit: ScheduleEdit) {
        const block = rangeOf(schedule)
        const day = dateFormatter.format(block.start)

        // Turning it back on leaves it as a one-off block, even when it was a week of a repeating one
        if (schedule.type === 'USER_RESERVED') {
            if (!edit.active) return
            void run(async () => {
                await deleteAvailability(schedule.id)
                await createAvailability(block.start, block.end)
            }, 'Horario activado.', 'No pudimos activar el horario.', true)
            return
        }

        if (!edit.active) {
            void run(async () => {
                if (schedule.rrule === null) await deleteAvailability(schedule.id)
                else await skipOccurrence(schedule)
                await markOff(block)
            }, `Desactivado el ${day}. Tocalo para volver a activarlo.`, 'No pudimos desactivar el horario.', true)
            return
        }

        const slot = weeklySlotFor(edit.range)
        if (schedule.rrule !== null) {
            if (!edit.repeats) {
                void run(() => updateAvailability(schedule.id, edit.range.start, edit.range.end, false),
                    `Listo: ya no se repite, queda solo el ${day}.`, 'No pudimos guardar los cambios.', true)
            } else if (slot) {
                void run(() => changeEveryWeek(schedule, edit.range),
                    `Listo: ahora figurás disponible ${everyDay(slot.dayOfWeek)} de ${slotHours(slot)}.`, 'No pudimos guardar los cambios.', true)
            }
            return
        }

        if (edit.repeats && slot) {
            void run(() => updateAvailability(schedule.id, edit.range.start, edit.range.end, true),
                `Listo: vas a figurar disponible ${everyDay(slot.dayOfWeek)} de ${slotHours(slot)}.`, 'No pudimos guardar los cambios.', true)
        } else {
            void run(() => updateAvailability(schedule.id, edit.range.start, edit.range.end),
                `Horario cambiado al ${scheduleLabel(edit.range)}.`, 'No pudimos guardar los cambios.', true)
        }
    }

    /** Deleting asks first; going back returns to the edit panel. */
    function confirmDeletion(schedule: Schedule, onlyThisDay: boolean) {
        const block = rangeOf(schedule)
        const back: ModalState = { kind: 'edit', schedule }
        if (schedule.rrule === null) {
            setModal({
                kind: 'delete',
                description: `Vas a eliminar el horario del ${scheduleLabel(block)}.`,
                onConfirm: () => void run(() => deleteAvailability(schedule.id), 'Horario eliminado.', 'No pudimos eliminar el horario.'),
                back,
            })
            return
        }
        const every = everyDay(dayOfWeekOf(block.start))
        setModal(onlyThisDay
            ? {
                kind: 'delete',
                description: `Vas a eliminar el horario del ${scheduleLabel(block)}. Las demás semanas siguen igual.`,
                onConfirm: () => void run(() => skipOccurrence(schedule),
                    `Eliminado el ${dateFormatter.format(block.start)}.`, 'No pudimos eliminar el horario.'),
                back,
            }
            : {
                kind: 'delete',
                description: `Vas a eliminar este horario de ${every}. Deja de repetirse en todas las semanas.`,
                onConfirm: () => void run(() => deleteAvailability(schedule.id), 'Horario semanal eliminado.', 'No pudimos eliminar el horario semanal.'),
                back,
            })
    }

    return <section className="profile-section schedule-editor" aria-labelledby="schedule-title">
        <h2 id="schedule-title">Horarios de atención</h2>
        <p className="profile-subtitle">Marcá en el calendario cuándo estás disponible. Los clientes verán estos horarios en tu perfil público.</p>

        <div className="schedule-editor__legend" aria-hidden="true">
            <span><i className="schedule-editor__swatch schedule-editor__swatch--available" /> Disponible</span>
            <span><i className="schedule-editor__swatch schedule-editor__swatch--weekly">↻</i> Se repite cada semana</span>
            <span><i className="schedule-editor__swatch schedule-editor__swatch--busy" /> Trabajo agendado o desactivado</span>
            <span><i className="schedule-editor__now-sample" /> Desde acá podés agregar horarios</span>
        </div>

        <div className="schedule-editor__calendar" aria-busy={loading || busy}>
            <FullCalendar
                ref={calendar}
                plugins={plugins}
                locale={esLocale}
                initialView={window.matchMedia(COMPACT_QUERY).matches ? COMPACT_VIEW : WEEK_VIEW}
                views={views}
                headerToolbar={headerToolbar}
                customButtons={customButtons}
                validRange={validRange}
                height={600}
                scrollTime="07:00:00"
                allDaySlot={false}
                nowIndicator
                slotDuration="00:30:00"
                snapDuration="00:15:00"
                slotLabelFormat={hourFormat}
                eventTimeFormat={hourFormat}
                dayHeaderFormat={dayHeaderFormat}
                selectable={!busy && !loading}
                selectMirror
                selectOverlap={false}
                eventOverlap={false}
                selectLongPressDelay={300}
                eventLongPressDelay={300}
                selectAllow={span => span.start >= new Date()}
                eventAllow={span => span.start >= new Date()}
                events={events}
                select={chooseHowToAdd}
                eventChange={changeBlock}
                eventClick={openBlock}
                eventContent={eventContent}
                datesSet={showRange}
            />
            {/* Always there, so it can fade out instead of the blocks popping in */}
            <div className={`schedule-editor__loading${loading ? ' is-visible' : ''}`} role="status" aria-hidden={!loading}>
                <span className="schedule-editor__spinner" aria-hidden="true" />
                {loading && 'Cargando horarios...'}
            </div>
        </div>

        {error && <p className="profile-error" role="alert">{error}</p>}
        {message && <output className="profile-feedback">{message}</output>}
        {pickerDate && <ScheduleDatePicker
            value={pickerDate}
            min={new Date(now)}
            onChange={date => {
                calendar.current?.getApi().gotoDate(date)
                setPickerDate(null)
            }}
            onClose={() => setPickerDate(null)}
        />}
        {modal?.kind === 'choice' && <ScheduleChoiceModal
            title={modal.title}
            description={modal.description}
            choices={modal.choices}
            busy={busy}
            onCancel={() => setModal(null)}
        />}
        {modal?.kind === 'delete' && <ScheduleDeleteModal
            description={modal.description}
            busy={busy}
            onConfirm={modal.onConfirm}
            onCancel={() => setModal(modal.back ?? null)}
        />}
        {modal?.kind === 'add' && <ScheduleAddPanel
            initial={modal.range}
            now={now}
            busy={busy}
            error={error}
            onSave={addTyped}
            onClose={() => setModal(null)}
        />}
        {modal?.kind === 'edit' && <ScheduleEditPanel
            key={eventId(modal.schedule)}
            schedule={modal.schedule}
            busy={busy}
            error={error}
            onSave={edit => saveEdit(modal.schedule, edit)}
            onDeleteDay={() => confirmDeletion(modal.schedule, true)}
            onDeleteAll={() => confirmDeletion(modal.schedule, false)}
            onClose={() => setModal(null)}
        />}
    </section>
}
