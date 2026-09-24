import Icon from '../../../components/Icon/Icon'

interface ReviewsSectionProps {
    rating: number | null
}

function ReviewsSection({ rating }: ReviewsSectionProps) {
    return (
        <section className="public-profile-section reviews-section" aria-labelledby="reviews-heading">
            <h2 id="reviews-heading">Calificaciones</h2>
            {rating === null
                ? <p className="profile-empty">Este profesional todavía no tiene calificaciones.</p>
                : <>
                    <div className="reviews-summary">
                        <Icon name="star" />
                        <strong>{rating.toFixed(1)}</strong>
                        <span>de 10</span>
                    </div>
                    <p className="profile-empty">Las opiniones individuales todavía no están disponibles.</p>
                </>}
        </section>
    )
}

export default ReviewsSection
