/** API values stay on the original 1–10 scale, including decimal professional averages. */
export function ratingToStars(rating: number): number {
    return rating / 2
}

export function starsToRating(stars: number): number {
    return stars * 2
}

/** Round only the label, never the stored API value or the value used in calculations. */
export function starLabel(rating: number): string {
    return new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(ratingToStars(rating))
}
