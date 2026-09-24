import avatarPlaceholder from '../../../assets/avatar-placeholder.svg'
import type { Professional } from '../../../types/Professional'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import { getCurrentUser } from '../../../services/authService'
import Rating from './Rating'
import './ProfessionalCard.css'

interface ProfessionalCardProps {
    professional: Professional
    selectedTradeId?: number | null
}

function ProfessionalCard({ professional, selectedTradeId = null }: ProfessionalCardProps) {
    const currentUser = getCurrentUser()
    const isOwnProfile = currentUser?.id === professional.id
    const profilePath = selectedTradeId === null
        ? `/profesionales/${professional.id}`
        : `/profesionales/${professional.id}?tradeId=${selectedTradeId}`
    const relevantTrades = selectedTradeId === null
        ? professional.expertiseTrades
        : professional.expertiseTrades.filter(trade => trade.tradeId === selectedTradeId)
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
                        {professional.expertiseTrades.map(trade => <span className={trade.tradeId === selectedTradeId ? 'selected' : ''} key={trade.tradeId}>{trade.tradeName}</span>)}
                    </div>
                )}
                <Rating value={professional.rating} />
                {professional.workingLocation && (
                    <p className="meta"><Icon name="location" /> {professional.workingLocation}</p>
                )}
                <p className="meta"><Icon name="calendar" /> Disponibilidad a confirmar</p>
            </div>

            <div className="professional-action">
                {price !== null && <span>
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
