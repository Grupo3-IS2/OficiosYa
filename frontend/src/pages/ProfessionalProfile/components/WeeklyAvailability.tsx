export interface AvailabilityBlock {
    day: number
    startHour: number
    endHour: number
}

interface WeeklyAvailabilityProps {
    blocks?: AvailabilityBlock[]
}

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const startHour = 8
const endHour = 20
const hourRows = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)

function WeeklyAvailability({ blocks = [] }: WeeklyAvailabilityProps) {
    return (
        <section className="public-profile-section availability-section" aria-labelledby="availability-heading">
            <h2 id="availability-heading">Disponibilidad semanal</h2>
            <p className="public-profile-section__intro">La disponibilidad es orientativa y puede variar al momento de solicitar el servicio.</p>

            {blocks.length === 0
                ? <p className="profile-empty availability-empty">Este profesional todavía no informó su disponibilidad semanal habitual.</p>
                : <div className="availability-scroll" tabIndex={0} aria-label="Disponibilidad semanal habitual">
                <div className="availability-grid">
                    <div className="availability-grid__corner" />
                    {days.map(day => <div className="availability-grid__day" key={day}>{day}</div>)}
                    <div className="availability-grid__times">
                        {hourRows.filter(hour => hour % 2 === 0).map(hour => (
                            <span key={hour} style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}>
                                {String(hour).padStart(2, '0')}:00
                            </span>
                        ))}
                    </div>
                    {days.map((day, dayIndex) => (
                        <div className="availability-grid__column" key={day}>
                            {hourRows.slice(0, -1).map(hour => <span className="availability-grid__line" key={hour} />)}
                            {blocks.filter(block => block.day === dayIndex).map(block => (
                                <span
                                    className="availability-grid__block"
                                    key={`${block.day}-${block.startHour}-${block.endHour}`}
                                    style={{
                                        top: `${((block.startHour - startHour) / (endHour - startHour)) * 100}%`,
                                        height: `${((block.endHour - block.startHour) / (endHour - startHour)) * 100}%`,
                                    }}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>}
        </section>
    )
}

export default WeeklyAvailability
