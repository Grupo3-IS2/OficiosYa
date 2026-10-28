import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { DateSelectArg, DatesSetArg, EventChangeArg, EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core'
import {
    createAvailability,
    createTimeOff,
    createWeeklyAvailability,
    deleteAvailability,
    deleteWeeklyAvailability,
    getProfessionalSchedule,
    skipWeeklyOccurrence,
    updateAvailability,
    updateWeeklyAvailability,
} from '../../../services/scheduleService'
import type { Schedule } from '../../../types/Schedule'
import { currentWeek } from '../../ProfessionalProfile/scheduleCalendar'
import { changedBlock, dateKey, dayOfWeekOf, everyDay, oneOffBlocks, planCreation, slotHours, weeklySlotFor, wholeBlock, without } from '../scheduleEditor'
import type { TimeRange } from '../scheduleEditor'
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

const COMPACT_QUERY = '(max-width: 650px)'
const WEEK_VIEW = 'timeGridWeek'
const COMPACT_VIEW = 'timeGridThreeDay'

const dateFormatter = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFormatter = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit' })

// FullCalendar recalculates the visible range whenever one of these objects changes, so they must keep their identity
const plugins = [timeGridPlugin, interactionPlugin]
const views = { [COMPACT_VIEW]: { type: 'timeGrid', duration: { days: 3 } } }
const headerToolbar = { left: 'prev,next today pickDate', center: 'title', right: '' }
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

function capitalized(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1)
}

function errorMessage(reason: unknown, fallback: string): string {
    return reason instanceof Error ? reason.message : fallback
}

function eventId(schedule: Schedule): string {
    return `${schedule.id ?? `weekly-${schedule.weeklyAvailabilityId}`}-${schedule.startTimestamp}`
}

function samePiece(first: TimeRange, second: TimeRange): boolean {
    return first.start.getTime() === second.start.getTime() && first.end.getTime() === second.end.getTime()
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
    }))

    // Moves the line that marks from when blocks can be added
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000)
        return () => window.clearInterval(timer)
    }, [])

    // The agenda comes with the usual week included, and every availability cut around jobs and time off
    useEffect(() => {
        if (!visibleRange) return
        const [from, to] = visibleRange.split('|').map(value => new Date(Number(value)))
        let active = true
        void getProfessionalSchedule(professionalId, from, to)
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
            const piece = { start: new Date(schedule.startTimestamp), end: new Date(schedule.endTimestamp) }
            const block = wholeBlock(schedule)
            // A piece of a block cut by a job can't be moved, and only an end that is the block's end can stretch
            const canChange = available && upcoming && !busy
            return {
                id: eventId(schedule),
                title: blockTitles[schedule.type],
                start: schedule.startTimestamp,
                end: schedule.endTimestamp,
                startEditable: canChange && samePiece(piece, block),
                durationEditable: canChange && piece.end.getTime() === block.end.getTime(),
                extendedProps: { schedule },
                classNames: [
                    available ? 'schedule-event--available' : 'schedule-event--busy',
                    schedule.weeklyAvailabilityId !== null ? 'schedule-event--weekly' : '',
                    upcoming && schedule.type !== 'SCHEDULED_JOB' ? 'schedule-event--clickable' : '',
                    upcoming ? '' : 'schedule-event--past',
                ],
            }
        })]
    }, [schedules, busy, now, validRange])

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
        if (absorbed?.id) await deleteAvailability(absorbed.id)
        try {
            await updateAvailability(plan.id, plan.start, plan.end)
        } catch (reason) {
            if (absorbed) {
                const { start, end } = wholeBlock(absorbed)
                await createAvailability(start, end)
            }
            throw reason
        }
    }

    function chooseHowToAdd(selection: DateSelectArg) {
        selection.view.calendar.unselect()
        const range = { start: selection.start, end: selection.end }
        const slot = weeklySlotFor(range)
        const choices: ScheduleChoice[] = []
        if (slot) {
            choices.push({
                label: capitalized(everyDay(slot.dayOfWeek)),
                hint: 'Se repite cada semana. Si algún día no podés, lo marcás como día libre.',
                onSelect: () => void run(() => createWeeklyAvailability(slot), `Listo: vas a figurar disponible ${everyDay(slot.dayOfWeek)}.`, 'No pudimos agregar el horario semanal.'),
            })
        }
        choices.push({
            label: `Solo el ${dateFormatter.format(range.start)}`,
            hint: 'Un horario puntual, que no se repite.',
            onSelect: () => void run(() => addOneOff(range), 'Horario agregado.', 'No pudimos agregar el horario.'),
        })
        setModal({ kind: 'choice', title: '¿Se repite todas las semanas?', description: `${scheduleLabel(range)}.`, choices })
    }

    /**
     * Puts the change in the state before saving it. Otherwise the next render (busy, saving) hands the calendar
     * the old position and the block jumps back until the agenda reloads. Returns how to undo it.
     */
    function showChange(schedule: Schedule, changed: TimeRange, block: TimeRange): () => void {
        const previous = schedules
        const key = eventId(schedule)
        setSchedules(current => current.map(other => eventId(other) === key
            ? {
                ...other,
                startTimestamp: changed.start.toISOString(),
                endTimestamp: changed.end.toISOString(),
                blockStartTimestamp: block.start.toISOString(),
                blockEndTimestamp: block.end.toISOString(),
            }
            : other))
        return () => setSchedules(previous)
    }

    function changeBlock(change: EventChangeArg) {
        const schedule = change.event.extendedProps.schedule as Schedule
        const { start, end } = change.event
        if (!start || !end) {
            change.revert()
            return
        }
        const piece = { start: new Date(schedule.startTimestamp), end: new Date(schedule.endTimestamp) }
        const block = changedBlock(wholeBlock(schedule), piece, { start, end })

        if (schedule.weeklyAvailabilityId === null && schedule.id !== null) {
            const id = schedule.id
            const undo = showChange(schedule, { start, end }, block)
            void run(async () => {
                try {
                    await updateAvailability(id, block.start, block.end)
                } catch (reason) {
                    undo()
                    throw reason
                }
            }, `Horario cambiado al ${scheduleLabel(block)}.`, 'No pudimos cambiar el horario.')
            return
        }

        // Changing one occurrence of the usual week changes every week; the message says so
        const weeklyId = schedule.weeklyAvailabilityId
        const slot = weeklySlotFor(block)
        if (weeklyId === null || !slot) {
            change.revert()
            setError('Un horario que se repite tiene que empezar y terminar el mismo día.')
            return
        }
        const undo = showChange(schedule, { start, end }, block)
        void run(async () => {
            try {
                await updateWeeklyAvailability(weeklyId, slot)
            } catch (reason) {
                undo()
                throw reason
            }
        }, `Listo: ahora figurás disponible ${everyDay(slot.dayOfWeek)} de ${slotHours(slot)}.`, 'No pudimos cambiar el horario semanal.')
    }

    function openBlock(click: EventClickArg) {
        const schedule = click.event.extendedProps.schedule as Schedule | undefined
        if (!schedule || new Date(schedule.endTimestamp).getTime() <= now || schedule.type === 'SCHEDULED_JOB') return
        if (schedule.type === 'USER_RESERVED' && schedule.id === null) return
        setError('')
        setMessage('')
        setModal({ kind: 'edit', schedule })
    }

    /** The free pieces of the block the schedule belongs to: jobs may have taken part of it. */
    function freePieces(schedule: Schedule): TimeRange[] {
        return schedules
            .filter(other => schedule.weeklyAvailabilityId !== null
                ? other.weeklyAvailabilityId === schedule.weeklyAvailabilityId && other.blockStartTimestamp === schedule.blockStartTimestamp
                : other.type === 'URGENT_AVAILABLE' && other.id === schedule.id)
            .map(other => ({ start: new Date(other.startTimestamp), end: new Date(other.endTimestamp) }))
    }

    function saveEdit(schedule: Schedule, edit: ScheduleEdit) {
        const block = wholeBlock(schedule)
        const day = dateFormatter.format(block.start)

        if (schedule.type === 'USER_RESERVED') {
            const id = schedule.id
            if (id === null || !edit.active) return
            void run(() => deleteAvailability(id), 'Horario activado.', 'No pudimos activar el horario.', true)
            return
        }

        if (!edit.active) {
            const pieces = freePieces(schedule)
            void run(() => Promise.all(pieces.map(piece => createTimeOff(piece.start, piece.end))),
                `Desactivado el ${day}. Tocalo para volver a activarlo.`, 'No pudimos desactivar el horario.', true)
            return
        }

        const slot = weeklySlotFor(edit.range)
        const weeklyId = schedule.weeklyAvailabilityId
        if (weeklyId !== null) {
            if (!edit.repeats) {
                void run(async () => {
                    // The one-off blocks already on that day stay as they are
                    for (const range of without(edit.range, oneOffBlocks(schedules))) await createAvailability(range.start, range.end)
                    await deleteWeeklyAvailability(weeklyId)
                }, `Listo: ya no se repite, queda solo el ${day}.`, 'No pudimos guardar los cambios.', true)
            } else if (slot) {
                void run(() => updateWeeklyAvailability(weeklyId, slot),
                    `Listo: ahora figurás disponible ${everyDay(slot.dayOfWeek)} de ${slotHours(slot)}.`, 'No pudimos guardar los cambios.', true)
            }
            return
        }

        const id = schedule.id
        if (id === null) return
        if (edit.repeats && slot) {
            void run(async () => {
                await createWeeklyAvailability(slot)
                await deleteAvailability(id)
            }, `Listo: vas a figurar disponible ${everyDay(slot.dayOfWeek)} de ${slotHours(slot)}.`, 'No pudimos guardar los cambios.', true)
        } else {
            void run(() => updateAvailability(id, edit.range.start, edit.range.end),
                `Horario cambiado al ${scheduleLabel(edit.range)}.`, 'No pudimos guardar los cambios.', true)
        }
    }

    /** Deleting asks first; going back returns to the edit panel. */
    function confirmDeletion(schedule: Schedule, onlyThisDay: boolean) {
        const block = wholeBlock(schedule)
        const back: ModalState = { kind: 'edit', schedule }
        const weeklyId = schedule.weeklyAvailabilityId
        if (weeklyId === null) {
            const id = schedule.id
            if (id === null) return
            setModal({
                kind: 'delete',
                description: `Vas a eliminar el horario del ${scheduleLabel(block)}.`,
                onConfirm: () => void run(() => deleteAvailability(id), 'Horario eliminado.', 'No pudimos eliminar el horario.'),
                back,
            })
            return
        }
        const every = everyDay(dayOfWeekOf(block.start))
        setModal(onlyThisDay
            ? {
                kind: 'delete',
                description: `Vas a eliminar el horario del ${scheduleLabel(block)}. Las demás semanas siguen igual.`,
                onConfirm: () => void run(() => skipWeeklyOccurrence(weeklyId, dateKey(block.start)),
                    `Eliminado el ${dateFormatter.format(block.start)}.`, 'No pudimos eliminar el horario.'),
                back,
            }
            : {
                kind: 'delete',
                description: `Vas a eliminar este horario de ${every}. Deja de repetirse en todas las semanas.`,
                onConfirm: () => void run(() => deleteWeeklyAvailability(weeklyId), 'Horario semanal eliminado.', 'No pudimos eliminar el horario semanal.'),
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
                datesSet={(range: DatesSetArg) => setVisibleRange(`${range.start.getTime()}|${range.end.getTime()}`)}
            />
            {loading && <p className="schedule-editor__loading" role="status">Cargando horarios...</p>}
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
