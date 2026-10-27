import Icon from '../../../components/Icon/Icon'
import { starLabel } from '../../../utils/ratingScale'
import './Rating.css'

interface RatingProps {
    value: number | null
    reviewCount?: number
}

function Rating({ value, reviewCount }: RatingProps) {
    return (
        <span
            className={`rating${value === null ? ' rating--empty' : ''}`}
            aria-label={value === null ? 'Sin calificaciones' : `Calificación ${starLabel(value)} de 5${reviewCount === undefined ? '' : `, ${reviewCount} reseñas`}`}
        >
            <Icon name="star" />
            {value === null ? 'Sin calificaciones' : starLabel(value)}
            {reviewCount !== undefined && <small>({reviewCount})</small>}
        </span>
    )
}

export default Rating

