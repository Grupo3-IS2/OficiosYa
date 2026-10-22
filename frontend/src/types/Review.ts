/** Ratings use the API's 1–10 scale. */
export interface ProfessionalReview {
    jobRequestId: number
    clientName: string
    clientProfileImageUrl: string | null
    professionalId: string
    professionalName: string
    rating: number
    review: string | null
}

export interface ReviewPage {
    content: ProfessionalReview[]
    number: number
    totalElements: number
    last: boolean
}
