import { useState } from 'react'
import Icon from '../../components/Icon/Icon'
import { starLabel } from '../../utils/ratingScale'

/** Ten native radio choices across five outlined stars: each half is a separate hit target. */
export default function StarRatingInput({ value, onChange, disabled, error }: Readonly<{
    value: number | null; onChange: (value: number) => void; disabled: boolean; error?: string
}>) {
    const [preview, setPreview] = useState<number | null>(null)
    const shown = preview ?? value ?? 0
    return <fieldset className="review-stars" disabled={disabled} aria-describedby={error ? 'review-score-label review-score-error' : 'review-score-label'}
        onPointerLeave={() => setPreview(null)}>
        <legend>¿Cómo fue tu experiencia?</legend>
        <div className="review-stars__row">
            {[0, 1, 2, 3, 4].map(index => {
                const filled = Math.max(0, Math.min(2, shown - index * 2))
                return <div className="review-star" key={index}>
                    <Icon name="star" className="icon review-star__outline" />
                    <span className="review-star__gold" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - filled * 50}% 0 0)` }}><Icon name="star" /></span>
                    {[1, 2].map(half => {
                        const rating = index * 2 + half
                        return <label key={half} className={`review-star__half review-star__half--${half === 1 ? 'left' : 'right'}`}
                            onPointerEnter={event => { if (event.pointerType === 'mouse' && !disabled) setPreview(rating) }}>
                            <input type="radio" name="professional-rating" value={rating} checked={value === rating}
                                aria-label={`${starLabel(rating)} de 5 estrellas`} aria-invalid={Boolean(error)}
                                onChange={() => { setPreview(null); onChange(rating) }} />
                            <span className="review-star__focus" aria-hidden="true" />
                        </label>
                    })}
                </div>
            })}
        </div>
        <p id="review-score-label" className="review-stars__label" aria-live="polite">
            {shown ? `${starLabel(shown)} de 5 estrellas` : 'Seleccioná una puntuación'}
        </p>
        {error && <p className="professional-review__error" id="review-score-error">{error}</p>}
    </fieldset>
}
