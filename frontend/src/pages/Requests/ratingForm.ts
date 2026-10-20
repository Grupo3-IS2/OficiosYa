import type { JobRequest } from '../../types/JobRequest.ts'

export const REVIEW_MAX_LENGTH = 1000
export interface RatingDraft { rating: number | null; review: string }
export interface RatingErrors { rating?: string; review?: string }

export function canRateRequest(request: Pick<JobRequest, 'status' | 'clientId' | 'rating'>, viewerId: string | undefined): boolean {
    return Boolean(viewerId && request.clientId === viewerId && request.status === 'COMPLETED' && request.rating == null)
}

export function validateRating(draft: RatingDraft): RatingErrors {
    const errors: RatingErrors = {}
    if (draft.rating === null || !Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 10) errors.rating = 'Seleccioná una puntuación.'
    if (!draft.review.trim()) errors.review = 'Contanos tu experiencia antes de enviar.'
    else if (draft.review.length > REVIEW_MAX_LENGTH) errors.review = 'El comentario no puede superar los 1000 caracteres.'
    return errors
}

export function ratingPayload(draft: RatingDraft): { rating: number; review: string } | null {
    if (Object.keys(validateRating(draft)).length) return null
    return { rating: draft.rating!, review: draft.review.trim() }
}

export function ratingFailure(status: number | undefined, message: string): string {
    if (status === 401) return 'Tu sesión venció. Volvé a iniciar sesión para enviar la valoración.'
    if (status === 403) return 'Solo el cliente de este trabajo puede valorarlo.'
    if (status === 404) return 'No encontramos esta solicitud. Cerrá la ventana y actualizá el listado.'
    if (status === 409) return 'La solicitud cambió o ya fue calificada. Vamos a comprobar su estado.'
    if (status === 400) return message
    return 'No pudimos confirmar el envío. Tu puntuación y comentario se conservaron; revisá tu conexión e intentá nuevamente.'
}
