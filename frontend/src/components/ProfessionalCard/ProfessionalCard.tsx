import avatarPlaceholder from '../../assets/avatar-placeholder.svg'
import type { Professional } from '../../types/Professional'
import Button from '../Button/Button'
import Icon from '../Icon/Icon'
import Rating from '../Rating/Rating'
import './ProfessionalCard.css'

interface ProfessionalCardProps {
    professional: Professional
}

function ProfessionalCard({ professional }: ProfessionalCardProps) {
    const distance = professional.distanceKm.toFixed(1).replace('.', ',')
    const price = professional.startingPrice.toLocaleString('es-UY')

    return (
        <article className="professional-card">
            <img
                src={avatarPlaceholder}
                alt={`Foto de ${professional.name}`}
            />

            <div className="professional-info">
                <h3>{professional.name}</h3>
                <p className="profession">{professional.profession}</p>
                <Rating
                    value={professional.rating}
                    reviewCount={professional.reviewCount}
                />
                <p className="meta">
                    <Icon name="location" />
                    {professional.neighborhood} · {distance} km
                </p>
                <p className="meta">
                    <Icon name="calendar" />
                    {professional.availability}
                </p>
            </div>

            <div className="professional-action">
                <span>
                    Desde
                    <strong>${price}</strong>
                </span>
                <Button type="button">Ver perfil</Button>
            </div>
        </article>
    )
}

export default ProfessionalCard
