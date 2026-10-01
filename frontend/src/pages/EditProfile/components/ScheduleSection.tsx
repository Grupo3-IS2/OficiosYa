import { useEffect, useState } from 'react'
import Button from '../../../components/Button/Button'
import { createAvailability, deleteAvailability, getProfessionalSchedule, updateAvailability } from '../../../services/scheduleService'
import type { Schedule } from '../../../types/Schedule'
import { emptyScheduleDraft, repeatedScheduleDates, scheduleDraftDates, scheduleDraftFrom } from '../scheduleForm'
import type { ScheduleDraft, ScheduleRepeat } from '../scheduleForm'
import ScheduleDatePicker from './ScheduleDatePicker'
import ScheduleDeleteModal from './ScheduleDeleteModal'
import ScheduleTimePicker from './ScheduleTimePicker'

interface PendingDeletion {
    ids: number[]
    description: string
}

const dateFormatter = new Intl.DateTimeFormat('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
})
const timeFormatter = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit' })
const dayFormatter = new Intl.DateTimeFormat('es-UY', { day: '2-digit' })
const monthFormatter = new Intl.DateTimeFormat('es-UY', { month: 'short' })
const weekdayFormatter = new Intl.DateTimeFormat('es-UY', { weekday: 'long' })

function beginningOfToday(): Date {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
}

function scheduleLabel(schedule: Schedule): string {
    const start = new Date(schedule.startTimestamp)
    const end = new Date(schedule.endTimestamp)
    return `${dateFormatter.format(start)}, de ${timeFormatter.format(start)} a ${timeFormatter.format(end)}`
}

function scheduleCard(schedule: Schedule) {
    const start = new Date(schedule.startTimestamp)
    const end = new Date(schedule.endTimestamp)
    return {
        day: dayFormatter.format(start),
        month: monthFormatter.format(start).replace('.', ''),
        weekday: weekdayFormatter.format(start),
        year: start.getFullYear(),
        time: `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`,
    }
}

export default function ScheduleSection({ professionalId }: Readonly<{ professionalId: string }>) {
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [draft, setDraft] = useState<ScheduleDraft>(emptyScheduleDraft)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [repeat, setRepeat] = useState<ScheduleRepeat>('NEVER')
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)

    useEffect(() => {
        let active = true
        void getProfessionalSchedule(professionalId, beginningOfToday())
            .then(response => {
                if (active) setSchedules(response.filter(schedule => schedule.type === 'URGENT_AVAILABLE'))
            })
            .catch(() => {
                if (active) setError('No pudimos cargar tus horarios de atención.')
            })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [professionalId])

    function changeDraft(changes: Partial<ScheduleDraft>) {
        setDraft(current => ({ ...current, ...changes }))
        setError('')
        setMessage('')
    }

    function resetForm() {
        setDraft(emptyScheduleDraft())
        setEditingId(null)
        setRepeat('NEVER')
    }

    async function saveSchedule() {
        const dates = editingId === null ? repeatedScheduleDates(draft, repeat) : []
        const editedDates = editingId !== null ? scheduleDraftDates(draft) : null
        if ((editingId === null && dates.length === 0) || (editingId !== null && !editedDates)) {
            setError('Elegí una fecha y un horario de fin posterior al horario de inicio.')
            return
        }

        setBusy(true)
        setError('')
        setMessage('')
        try {
            if (editingId !== null && editedDates) {
                const saved = await updateAvailability(editingId, editedDates.start, editedDates.end)
                setSchedules(current => [...current.filter(schedule => schedule.id !== saved.id), saved]
                    .sort((first, second) => first.startTimestamp.localeCompare(second.startTimestamp)))
                setMessage('Horario actualizado.')
                resetForm()
            } else {
                const results = await Promise.allSettled(dates.map(date => createAvailability(date.start, date.end)))
                const created = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
                const failed = results.filter(result => result.status === 'rejected')
                if (created.length > 0) {
                    setSchedules(current => [...current, ...created]
                        .sort((first, second) => first.startTimestamp.localeCompare(second.startTimestamp)))
                    setMessage(created.length === 1 ? 'Horario agregado.' : `${created.length} horarios agregados.`)
                    resetForm()
                }
                if (failed.length > 0) {
                    const firstReason = failed[0].status === 'rejected' ? failed[0].reason : null
                    setError(created.length > 0
                        ? `${failed.length} horarios no pudieron agregarse porque se superponen o no son válidos.`
                        : firstReason instanceof Error ? firstReason.message : 'No pudimos guardar los horarios.')
                }
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No pudimos guardar el horario.')
        } finally {
            setBusy(false)
        }
    }

    function startEditing(schedule: Schedule) {
        setEditingId(schedule.id)
        setDraft(scheduleDraftFrom(schedule.startTimestamp, schedule.endTimestamp))
        setError('')
        setMessage('')
    }

    function requestScheduleRemoval(schedule: Schedule) {
        setPendingDeletion({
            ids: [schedule.id],
            description: `Vas a eliminar el horario del ${scheduleLabel(schedule)}. Esta acción no se puede deshacer.`,
        })
    }

    async function confirmRemoval() {
        if (!pendingDeletion) return
        const ids = pendingDeletion.ids
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const results = await Promise.allSettled(ids.map(id => deleteAvailability(id)))
            const removedIds = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
            const failedCount = ids.length - removedIds.size
            setSchedules(current => current.filter(schedule => !removedIds.has(schedule.id)))
            setSelectedIds(current => new Set([...current].filter(id => !removedIds.has(id))))
            if (editingId !== null && removedIds.has(editingId)) resetForm()
            if (removedIds.size > 0) setMessage(removedIds.size === 1 ? 'Horario eliminado.' : `${removedIds.size} horarios eliminados.`)
            if (failedCount > 0) setError(`${failedCount} ${failedCount === 1 ? 'horario no pudo eliminarse' : 'horarios no pudieron eliminarse'}.`)
        } finally {
            setBusy(false)
            setPendingDeletion(null)
        }
    }

    function toggleSelected(id: number) {
        setSelectedIds(current => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function toggleAll() {
        setSelectedIds(current => current.size === schedules.length
            ? new Set()
            : new Set(schedules.map(schedule => schedule.id)))
    }

    function requestSelectedRemoval() {
        const ids = [...selectedIds]
        if (ids.length === 0) return
        setPendingDeletion({
            ids,
            description: `Vas a eliminar ${ids.length} ${ids.length === 1 ? 'horario seleccionado' : 'horarios seleccionados'}. Esta acción no se puede deshacer.`,
        })
    }

    const sortedSchedules = [...schedules].sort((first, second) => first.startTimestamp.localeCompare(second.startTimestamp))

    return <section className="profile-section schedule-editor" aria-labelledby="schedule-title">
        <h2 id="schedule-title">Horarios de atención</h2>
        <p className="profile-subtitle">Agregá las franjas con fecha y hora en las que estás disponible. Se mostrarán en tu perfil público durante la semana correspondiente.</p>

        <form onSubmit={event => { event.preventDefault(); void saveSchedule() }}>
            <div className="schedule-editor__fields">
                <label>Fecha<ScheduleDatePicker value={draft.date} onChange={date => changeDraft({ date })} /></label>
                <label>Desde<ScheduleTimePicker label="Hora de inicio" value={draft.startTime} onChange={startTime => changeDraft({ startTime })} /></label>
                <label>Hasta<ScheduleTimePicker label="Hora de fin" value={draft.endTime} onChange={endTime => changeDraft({ endTime })} /></label>
                {editingId === null && <label className="schedule-editor__repeat">Repetir
                    <select value={repeat} onChange={event => setRepeat(event.target.value as ScheduleRepeat)}>
                        <option value="NEVER">No repetir</option>
                        <option value="WEEK">Todos los días de esta semana</option>
                        <option value="WEEKDAYS">Días hábiles de esta semana (lunes a viernes)</option>
                        <option value="MONTH_WEEKDAY">El mismo día cada semana, hasta fin de mes</option>
                        <option value="YEAR_WEEKDAY">El mismo día cada semana, hasta fin de año</option>
                    </select>
                </label>}
            </div>
            <div className="schedule-editor__form-actions">
                <Button type="submit" disabled={busy}>{editingId === null ? 'Agregar horario' : 'Guardar horario'}</Button>
                {editingId !== null && <button type="button" className="profile-text-link" onClick={resetForm} disabled={busy}>Cancelar edición</button>}
            </div>
        </form>

        <div className="schedule-editor__list" aria-busy={loading}>
            <div className="schedule-editor__list-heading">
                <h3>Próximos horarios</h3>
                {!loading && sortedSchedules.length > 0 && <button type="button" onClick={toggleAll} disabled={busy}>
                    {selectedIds.size === sortedSchedules.length ? 'Quitar selección' : 'Seleccionar todos'}
                </button>}
            </div>
            {selectedIds.size > 0 && <div className="schedule-editor__bulk-actions">
                <span>{selectedIds.size} {selectedIds.size === 1 ? 'seleccionado' : 'seleccionados'}</span>
                <button type="button" onClick={requestSelectedRemoval} disabled={busy}>Eliminar seleccionados</button>
            </div>}
            {loading
                ? <p className="schedule-editor__empty" role="status">Cargando horarios...</p>
                : sortedSchedules.length === 0
                    ? <p className="schedule-editor__empty">Todavía no agregaste horarios de atención.</p>
                    : <div className="schedule-editor__cards">
                        {sortedSchedules.map(schedule => {
                            const card = scheduleCard(schedule)
                            return <article className={`schedule-editor__item${selectedIds.has(schedule.id) ? ' is-selected' : ''}`} key={schedule.id}>
                                <input
                                    className="schedule-editor__select"
                                    type="checkbox"
                                    checked={selectedIds.has(schedule.id)}
                                    onChange={() => toggleSelected(schedule.id)}
                                    aria-label={`Seleccionar ${scheduleLabel(schedule)}`}
                                />
                                <div className="schedule-editor__date" aria-hidden="true">
                                    <strong>{card.day}</strong>
                                    <span>{card.month}</span>
                                </div>
                                <div className="schedule-editor__details">
                                    <strong>{card.weekday}</strong>
                                    <span>{card.time}</span>
                                    <small>{card.year}</small>
                                </div>
                                <div className="schedule-editor__item-actions">
                                    <button type="button" onClick={() => startEditing(schedule)} disabled={busy}>Editar</button>
                                    <button type="button" onClick={() => requestScheduleRemoval(schedule)} disabled={busy}>Eliminar</button>
                                </div>
                            </article>
                        })}
                    </div>}
        </div>
        {error && <p className="profile-error" role="alert">{error}</p>}
        {message && <output className="profile-feedback">{message}</output>}
        {pendingDeletion && <ScheduleDeleteModal
            description={pendingDeletion.description}
            busy={busy}
            onConfirm={() => void confirmRemoval()}
            onCancel={() => setPendingDeletion(null)}
        />}
    </section>
}
