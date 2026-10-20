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

/** The order as the backend names it; the ones it doesn't have ("Más cercanos") are by relevance. */
const BACKEND_ORDER: Partial<Record<NonNullable<ProfessionalOrder>, string>> = {
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
    if (filters.location.trim()) params.set('location', filters.location.trim())
    for (const [name, value] of availabilityParams(filters.availability, reference)) params.set(name, value)
    const backendOrder = order ? BACKEND_ORDER[order] : undefined
    if (backendOrder) params.set('order', backendOrder)
    return params
}
