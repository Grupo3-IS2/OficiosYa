import { useLayoutEffect, useRef, useState, type SubmitEvent } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import avatarPlaceholder from '../../assets/avatar-placeholder.svg'
import { ApiError } from '../../services/api'
import { getJobRequest, reviewJobRequest } from '../../services/jobRequestService'
import type { JobRequest } from '../../types/JobRequest'
import { serviceSummary } from './requestList'
import { canRateRequest, ratingFailure, ratingPayload, REVIEW_MAX_LENGTH, validateRating } from './ratingForm'
import StarRatingInput from './StarRatingInput'
import './ProfessionalRatingModal.css'

export default function ProfessionalRatingModal({ request, viewerId, onClose, onSaved, onReconciled }: Readonly<{
    request: JobRequest; viewerId: string | undefined; onClose: () => void
    onSaved: (request: JobRequest) => void; onReconciled: (request: JobRequest) => void
}>) {
    const dialog = useRef<HTMLDialogElement>(null)
    const inFlight = useRef(false)
    const [rating, setRating] = useState<number | null>(null)
    const [review, setReview] = useState('')
    const [mode, setMode] = useState<'form' | 'discard' | 'success'>('form')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [touched, setTouched] = useState(false)
    const [unavailable, setUnavailable] = useState(false)
    const errors = validateRating({ rating, review })
    const valid = Object.keys(errors).length === 0
    const eligible = canRateRequest(request, viewerId) && !unavailable

    useLayoutEffect(() => {
        const element = dialog.current
        if (!element) return
        const previousFocus = document.activeElement
        const bodyOverflow = document.body.style.overflow
        const rootOverflow = document.documentElement.style.overflow
        element.showModal()
        document.body.style.overflow = 'hidden'
        document.documentElement.style.overflow = 'hidden'
        element.querySelector<HTMLInputElement>('input')?.focus()
        return () => {
            element.close()
            document.body.style.overflow = bodyOverflow
            document.documentElement.style.overflow = rootOverflow
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
        }
    }, [])

    useLayoutEffect(() => {
        if (mode !== 'form') dialog.current?.querySelector<HTMLButtonElement>('[data-review-focus]')?.focus()
        else (dialog.current?.querySelector<HTMLInputElement>('input:checked') ?? dialog.current?.querySelector<HTMLInputElement>('input'))?.focus()
    }, [mode])

    function close() {
        if (inFlight.current) return
        if (mode === 'discard') { setMode('form'); return }
        if (mode === 'success' || !eligible || (rating === null && !review.length)) onClose()
        else setMode('discard')
    }

    async function submit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        if (inFlight.current || !eligible) return
        const payload = ratingPayload({ rating, review })
        setTouched(true)
        if (!payload) return
        inFlight.current = true
        setBusy(true)
        setError('')
        try {
            const updated = await reviewJobRequest(request.id, payload)
            onSaved(updated)
            setMode('success')
        } catch (failure) {
            const status = failure instanceof ApiError ? failure.status : undefined
            setError(ratingFailure(status, failure instanceof Error ? failure.message : ''))
            if (status === 403 || status === 404) setUnavailable(true)
            if (status === 409) {
                try {
                    const current = await getJobRequest(request.id)
                    onReconciled(current)
                    if (current.rating != null) {
                        setUnavailable(true)
                        setError('Esta solicitud ya fue calificada. La valoración existente no se modificó.')
                    } else if (!canRateRequest(current, viewerId)) {
                        setUnavailable(true)
                        setError('Esta solicitud ya no está disponible para valorar.')
                    } else setError('La solicitud cambió durante el envío. Revisá tu valoración y volvé a intentarlo.')
                } catch { setError('No pudimos comprobar si la valoración ya se guardó. Conservamos tus datos; intentá nuevamente cuando tengas conexión.') }
            }
        } finally { inFlight.current = false; setBusy(false) }
    }

    return createPortal(<dialog ref={dialog} className={`professional-review${mode === 'success' ? ' professional-review--success' : ''}`}
        aria-labelledby="professional-review-title" aria-busy={busy} onCancel={event => { event.preventDefault(); close() }}>
        <button className="professional-review__close" type="button" aria-label="Cerrar valoración" disabled={busy} onClick={close}><Icon name="close" /></button>
        <h2 id="professional-review-title">{mode === 'success' ? '¡Gracias por tu valoración!' : mode === 'discard' ? '¿Descartar tu valoración?' : 'Calificá tu experiencia'}</h2>
        {mode === 'success' ? <div className="professional-review__success" role="status">
            <span className="professional-review__success-icon"><Icon name="check" /></span>
            <p>Tu opinión nos ayuda a mejorar OficiosYa</p>
            <Button type="button" data-review-focus onClick={onClose}>Cerrar</Button>
        </div> : mode === 'discard' ? <div className="professional-review__discard">
            <p>Si salís ahora, se perderán la puntuación y el comentario que escribiste.</p>
            <div><Button type="button" data-review-focus onClick={() => setMode('form')}>Seguir calificando</Button>
                <Button type="button" variant="ghost" onClick={onClose}>Descartar cambios</Button></div>
        </div> : <>
            <div className="professional-review__identity">
                <img src={request.professionalProfileImageUrl || avatarPlaceholder} alt={`Foto de ${request.professionalName}`}
                    onError={event => { if (event.currentTarget.src !== new URL(avatarPlaceholder, window.location.href).href) event.currentTarget.src = avatarPlaceholder }} />
                <div><strong>{request.professionalName}</strong><p>{serviceSummary(request)}</p></div>
            </div>
            <form onSubmit={event => { void submit(event) }}>
                <StarRatingInput value={rating} onChange={value => { setRating(value); setError('') }} disabled={busy || !eligible} error={touched ? errors.rating : undefined} />
                <label className="professional-review__comment" htmlFor="professional-review-comment">Contanos tu experiencia
                    <textarea id="professional-review-comment" rows={3} maxLength={REVIEW_MAX_LENGTH} required value={review} disabled={busy || !eligible}
                        placeholder="¿Cómo fue el servicio?" aria-invalid={touched && Boolean(errors.review)}
                        aria-describedby={touched && errors.review ? 'professional-review-count professional-review-comment-error' : 'professional-review-count'}
                        onBlur={() => setTouched(true)} onChange={event => { setReview(event.target.value); setError('') }} />
                </label>
                <span className="professional-review__count" id="professional-review-count">{review.length} / {REVIEW_MAX_LENGTH}</span>
                {touched && errors.review && <p className="professional-review__error" id="professional-review-comment-error">{errors.review}</p>}
                {error && <p className="professional-review__error" role="alert">{error}</p>}
                {!eligible && !error && <p className="professional-review__error" role="alert">Esta solicitud ya no está disponible para valorar.</p>}
                {eligible ? <Button className="professional-review__submit" type="submit" disabled={busy || !valid}>{busy ? 'Enviando valoración…' : 'Enviar valoración'}</Button>
                    : <Button className="professional-review__submit" type="button" onClick={onClose}>Volver</Button>}
                <p className="professional-review__warning">Una vez enviada, no podrás modificar tu valoración.</p>
            </form>
        </>}
    </dialog>, document.body)
}
