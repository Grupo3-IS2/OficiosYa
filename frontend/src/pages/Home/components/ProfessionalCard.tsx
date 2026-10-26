import avatarPlaceholder from '../../../assets/avatar-placeholder.svg'
import type { Professional } from '../../../types/Professional'
import type { Schedule } from '../../../types/Schedule'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import { useSession } from '../../../components/SessionProvider/useSession'
import { professionalAvailability } from '../professionalAvailability'
import { tradesFor } from '../professionalFilters'
import Rating from './Rating'
import './ProfessionalCard.css'

interface ProfessionalCardProps {
    professional: Professional
    selectedTradeIds?: readonly number[]
    /** This week's schedules, loaded by the page (they also filter): undefined while loading, null if they failed. */
    schedules?: Schedule[] | null
}

function ProfessionalCard({ professional, selectedTradeIds = [], schedules }: ProfessionalCardProps) {
    const availability = schedules === undefined ? 'Cargando disponibilidad...'
        : schedules === null ? 'No pudimos cargar la disponibilidad'
            : professionalAvailability(schedules)

    const { user: currentUser, status } = useSession()
    const isOwnProfile = currentUser?.id === professional.id
    const relevantTrades = tradesFor(professional, selectedTradeIds)
    // The profile opens on one trade: the first chosen one this professional does.
    const profileTradeId = selectedTradeIds.length > 0 ? relevantTrades[0]?.tradeId : undefined
    const profilePath = profileTradeId === undefined
        ? `/profesionales/${professional.id}`
        : `/profesionales/${professional.id}?tradeId=${profileTradeId}`
    const price = relevantTrades.length
        ? Math.min(...relevantTrades.map(trade => trade.minimumHourlyWage))
        : null
    return (
        <article className="professional-card">
            <img
                src={professional.profileImageUrl || avatarPlaceholder}
                alt={`Foto de ${professional.name}`}
                onError={event => { event.currentTarget.src = avatarPlaceholder }}
            />

            <div className="professional-info">
                <h3>{professional.name}</h3>
                {professional.expertiseTrades.length > 0 && (
                    <div className="professional-trades" aria-label="Rubros">
                        {professional.expertiseTrades.map(trade => <span className={selectedTradeIds.includes(trade.tradeId) ? 'selected' : ''} key={trade.tradeId}>{trade.tradeName}</span>)}
                    </div>
                )}
                <Rating value={professional.rating} />
                {status === 'authenticated' && professional.workingLocation && (
                    <p className="meta"><Icon name="location" /> {professional.workingLocation}{professional.distanceKm != null && ` · a ${professional.distanceKm.toLocaleString('es-UY')} km`}</p>
                )}
                <p className="meta"><Icon name="calendar" /> {availability}</p>
            </div>

            <div className={`professional-action${isOwnProfile ? ' professional-action--own' : ''}`}>
                {!isOwnProfile && price !== null && <span>
                    Desde / hora
                    <strong>${price.toLocaleString('es-UY')}</strong>
                </span>}
                <Button
                    type="button"
                    onClick={() => { window.location.href = isOwnProfile ? '/profile/edit' : profilePath }}
                >
                    {isOwnProfile ? 'Ir a panel profesional' : 'Ver perfil'}
                </Button>
            </div>
        </article>
    )
}

export default ProfessionalCard
