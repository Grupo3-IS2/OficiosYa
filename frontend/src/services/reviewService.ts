import { apiRequest } from './api.ts'
import type { ReviewPage } from '../types/Review.ts'

/** The API requires a client session and returns a Spring Page. */
export function getProfessionalReviews(professionalId: string, page = 0): Promise<ReviewPage> {
    return apiRequest<ReviewPage>(`/professionals/${encodeURIComponent(professionalId)}/reviews?page=${page}&size=5`)
}
