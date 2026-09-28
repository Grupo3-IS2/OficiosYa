import Icon from '../../../components/Icon/Icon'
import './Rating.css'

interface RatingProps {
    value: number | null
    reviewCount?: number
    max?: number
}

function Rating({ value, reviewCount, max = 10 }: RatingProps) {
    return (
        <span
            className={`rating${value === null ? ' rating--empty' : ''}`}
            aria-label={value === null ? 'Sin calificaciones' : `Calificación ${value} de ${max}${reviewCount === undefined ? '' : `, ${reviewCount} reseñas`}`}
        >
            <Icon name="star" />
            {value === null ? 'Sin calificaciones' : `${value.toFixed(1)} / ${max}`}
            {reviewCount !== undefined && <small>({reviewCount})</small>}
        </span>
    )
}

export default Rating

