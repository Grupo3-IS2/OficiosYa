import type { Professional } from '../../types/Professional'
import { starsToRating } from '../../utils/ratingScale.ts'
import { availabilityWindow, type DayRange } from './professionalAvailability.ts'
import type { ProfessionalFilters } from './professionalFilters.ts'
import type { ProfessionalOrder } from './professionalOrder.ts'

/** What the professionals are searched by: the name, the trades, the filters and the order. */
export interface ProfessionalSearch {
    query: string
    tradeIds: readonly number[]
    filters: ProfessionalFilters
    order: ProfessionalOrder
}

export interface ProfessionalPage {
    content: Professional[]
    totalElements: number
    totalPages: number
}

/** The order as the backend names it; the ones it doesn't have are by relevance. */
const BACKEND_ORDER: Partial<Record<NonNullable<ProfessionalOrder>, string>> = {
    distance: 'DISTANCE',
    'price-asc': 'PRICE_ASC',
    'price-desc': 'PRICE_DESC',
    'rating-desc': 'RATING_DESC',
}

function availabilityParams(range: DayRange | null, reference: Date): [string, string][] {
    if (!range) return []
    const { from, to } = availabilityWindow(range, reference)
    return [['availableFrom', from.toISOString()], ['availableTo', to.toISOString()]]
}

/** The query string of one page of the search. Empty filters are left out. */
export function searchParams(search: ProfessionalSearch, page: number, size: number, reference = new Date()): URLSearchParams {
    const { query, tradeIds, filters, order } = search
    const params = new URLSearchParams({ page: String(page), size: String(size) })
    if (query.trim()) params.set('query', query.trim())
    for (const tradeId of tradeIds) params.append('tradeIds', String(tradeId))
    if (filters.minimumPrice !== null) params.set('minPrice', String(filters.minimumPrice))
    if (filters.maximumPrice !== null) params.set('maxPrice', String(filters.maximumPrice))
    if (filters.minimumRating !== null) params.set('minRating', String(starsToRating(filters.minimumRating)))
    // The name still goes with a point: it finds the professionals who haven't picked their area yet.
    if (filters.location.trim()) params.set('location', filters.location.trim())
    if (filters.point) {
        params.set('lat', String(filters.point.lat))
        params.set('lon', String(filters.point.lon))
        if (filters.maxDistanceKm !== null) params.set('maxDistanceKm', String(filters.maxDistanceKm))
    }
    for (const [name, value] of availabilityParams(filters.availability, reference)) params.set(name, value)
    // Nearest first needs a point to be near to.
    const backendOrder = order && (order !== 'distance' || filters.point) ? BACKEND_ORDER[order] : undefined
    if (backendOrder) params.set('order', backendOrder)
    return params
}
