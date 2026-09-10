import Icon from '../Icon/Icon'
import './Rating.css'

interface RatingProps {
    value: number
    reviewCount: number
}

function Rating({ value, reviewCount }: RatingProps) {
    return (
        <span
            className="rating"
            aria-label={`Calificación ${value} de 5, ${reviewCount} reseñas`}
        >
            <Icon name="star" />
            {value.toFixed(1)}
            <small>({reviewCount})</small>
        </span>
    )
}

export default Rating

