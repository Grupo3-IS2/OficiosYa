import Icon from '../Icon/Icon'
import { starLabel } from '../../utils/ratingScale'
import './RatingStars.css'

export default function RatingStars({ rating }: Readonly<{ rating: number }>) {
    return <span className="rating-stars" role="img" aria-label={`${starLabel(rating)} de 5 estrellas`}>
        {[0, 1, 2, 3, 4].map(index => {
            const filled = Math.max(0, Math.min(1, rating / 2 - index))
            return <span className="rating-stars__star" key={index} aria-hidden="true">
                <Icon name="star" />
                <span className="rating-stars__fill" style={{ clipPath: `inset(0 ${100 - filled * 100}% 0 0)` }}><Icon name="star" /></span>
            </span>
        })}
    </span>
}
