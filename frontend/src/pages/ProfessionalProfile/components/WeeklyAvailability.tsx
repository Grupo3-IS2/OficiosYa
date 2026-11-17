import type { CSSProperties } from 'react'
import type { Schedule } from '../../../types/Schedule'
import { calendarBlocks, currentWeek } from '../scheduleCalendar'

interface WeeklyAvailabilityProps {
    schedules: Schedule[]
    loading: boolean
    error: boolean
}

const HOUR_HEIGHT = 28
/** A short block still gets a grid tall enough to read its hours. */
const MIN_VISIBLE_HOURS = 4

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function hourLabel(hour: number): string {
    const hours = Math.floor(hour)
    const minutes = Math.round((hour - hours) * 60)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function WeeklyAvailability({ schedules, loading, error }: WeeklyAvailabilityProps) {
    const blocks = calendarBlocks(schedules, currentWeek())
    // Only the hours the week's blocks span: the box scrolls (max-height) just when they don't fit
    const firstHour = Math.floor(Math.min(...blocks.map(block => block.startHour)))
    const lastHour = Math.ceil(Math.max(...blocks.map(block => block.endHour)))
    const startHour = Math.max(0, Math.min(firstHour, lastHour - MIN_VISIBLE_HOURS))
    const endHour = Math.max(lastHour, startHour + MIN_VISIBLE_HOURS)
    const visibleHours = endHour - startHour
    const hourRows = Array.from({ length: visibleHours }, (_, index) => startHour + index)
    const timeLabels = [...hourRows.filter((_, index) => index % 2 === 0), endHour]
    const gridStyle = {
        '--schedule-height': `${visibleHours * HOUR_HEIGHT}px`,
        '--schedule-rows': visibleHours,
    } as CSSProperties

    return (
        <section className="public-profile-section availability-section" aria-labelledby="availability-heading">
            <h2 id="availability-heading">Disponibilidad semanal</h2>
            <p className="public-profile-section__intro">La agenda corresponde a la semana actual y puede variar al momento de solicitar el servicio.</p>

            {loading
                ? <p className="profile-empty availability-empty" role="status">Cargando disponibilidad...</p>
                : error
                    ? <p className="profile-empty availability-empty" role="status">No pudimos cargar la disponibilidad en este momento.</p>
                    : blocks.length === 0
                        ? <p className="profile-empty availability-empty">Este profesional no tiene bloques cargados para esta semana.</p>
                        : <>
                <div className="availability-legend" aria-hidden="true">
                    <span><i className="availability-legend__sample availability-legend__sample--available" /> Disponible</span>
                    <span><i className="availability-legend__sample availability-legend__sample--busy" /> No disponible</span>
                </div>
                <div className="availability-scroll" tabIndex={0} aria-label="Disponibilidad de la semana actual">
                <div className="availability-grid" style={gridStyle}>
                    <div className="availability-grid__corner" />
                    {days.map(day => <div className="availability-grid__day" key={day}>{day}</div>)}
                    <div className="availability-grid__times">
                        {timeLabels.map(hour => (
                            <span key={hour} style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}>
                                {String(hour).padStart(2, '0')}:00
                            </span>
                        ))}
                    </div>
                    {days.map((day, dayIndex) => (
                        <div className="availability-grid__column" key={day}>
                            {hourRows.map(hour => <span className="availability-grid__line" key={hour} />)}
                            {blocks.filter(block => block.day === dayIndex).map(block => (
                                <span
                                    className={`availability-grid__block availability-grid__block--${block.kind}`}
                                    key={block.key}
                                    aria-label={`${block.kind === 'available' ? 'Disponible' : 'No disponible'} el ${day.toLowerCase()} de ${hourLabel(block.startHour)} a ${hourLabel(block.endHour)}`}
                                    role="img"
                                    style={{
                                        top: `${((block.startHour - startHour) / (endHour - startHour)) * 100}%`,
                                        height: `${((block.endHour - block.startHour) / (endHour - startHour)) * 100}%`,
                                    }}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            </>}
        </section>
    )
}

export default WeeklyAvailability
