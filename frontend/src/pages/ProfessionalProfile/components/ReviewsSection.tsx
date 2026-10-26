import { useEffect, useState } from 'react'
import avatarPlaceholder from '../../../assets/avatar-placeholder.svg'
import RatingStars from '../../../components/RatingStars/RatingStars'
import { ApiError } from '../../../services/api'
import { getCurrentUser } from '../../../services/authService'
import { getProfessionalReviews } from '../../../services/reviewService'
import type { ProfessionalReview } from '../../../types/Review'
import { starLabel } from '../../../utils/ratingScale'

interface ReviewsSectionProps {
    professionalId: string
    rating: number | null
}

export default function ReviewsSection({ professionalId, rating }: Readonly<ReviewsSectionProps>) {
    const canRead = Boolean(getCurrentUser()?.role)
    const [reviews, setReviews] = useState<ProfessionalReview[]>([])
    const [page, setPage] = useState(0)
    const [retry, setRetry] = useState(0)
    const [total, setTotal] = useState<number | null>(null)
    const [last, setLast] = useState(true)
    const [loading, setLoading] = useState(canRead)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!canRead) return
        let active = true
        void getProfessionalReviews(professionalId, page).then(response => {
            if (!active) return
            setReviews(previous => page === 0 ? response.content : [
                ...previous,
                ...response.content.filter(review => !previous.some(item => item.jobRequestId === review.jobRequestId)),
            ])
            setTotal(response.totalElements)
            setLast(response.last)
            setError('')
        }).catch(error => {
            if (!active) return
            setError(error instanceof ApiError && error.status === 403
                ? 'Iniciá sesión para ver las opiniones.'
                : 'No pudimos cargar las opiniones. Intentá de nuevo.')
        }).finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [professionalId, canRead, page, retry])

    return <section className="public-profile-section reviews-section" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading">Calificaciones</h2>
        {rating !== null && <div className="reviews-summary">
            <strong>{starLabel(rating)}</strong>
            <div><RatingStars rating={rating} />
                {total !== null && <p>{total} {total === 1 ? 'opinión' : 'opiniones'}</p>}
            </div>
        </div>}
        {!canRead && <p className="profile-empty">Iniciá sesión para ver las opiniones.</p>}
        {canRead && <>
            {reviews.length > 0 && <ul className="profile-reviews">
                {reviews.map(review => <li key={review.jobRequestId} className="profile-review">
                    <img className="profile-review__avatar" src={review.clientProfileImageUrl || avatarPlaceholder}
                        alt={`Foto de ${review.clientName}`} loading="lazy"
                        onError={event => { if (event.currentTarget.getAttribute('src') !== avatarPlaceholder) event.currentTarget.src = avatarPlaceholder }} />
                    <div className="profile-review__body">
                        <h3>{review.clientName}</h3>
                        <RatingStars rating={review.rating} />
                        {review.review && <p>{review.review}</p>}
                    </div>
                </li>)}
            </ul>}
            {loading && <p className="profile-empty" role="status">Cargando opiniones...</p>}
            {!loading && !error && total === 0 && <p className="profile-empty">Este profesional todavía no tiene calificaciones.</p>}
            {error && <div className="profile-reviews__error" role="alert">
                <p>{error}</p>
                <button type="button" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Reintentar</button>
            </div>}
            {!last && !error && <button className="profile-reviews__more" type="button" disabled={loading}
                onClick={() => { setLoading(true); setPage(value => value + 1) }}>Ver más opiniones</button>}
        </>}
    </section>
}
