import type { PriceRange } from '../pages/Home/professionalFilters'
import { searchParams, type ProfessionalPage, type ProfessionalSearch } from '../pages/Home/professionalSearch'
import type { Professional } from '../types/Professional'
import { apiRequest } from './api'

/** One page of the published professionals that match: the search filters and orders them, not the page. */
export function searchProfessionals(search: ProfessionalSearch, page: number, size: number): Promise<ProfessionalPage> {
    return apiRequest<ProfessionalPage>(`/professionals/search?${searchParams(search, page, size).toString()}`)
}

/** The hourly rates on offer for those trades (all if none) and that name; null when nothing matches. */
export async function getPriceRange(tradeIds: readonly number[], query: string): Promise<PriceRange | null> {
    const params = new URLSearchParams()
    for (const tradeId of tradeIds) params.append('tradeIds', String(tradeId))
    if (query.trim()) params.set('query', query.trim())
    const range = await apiRequest<{ minimum: number | null; maximum: number | null }>(`/professionals/search/price-range?${params.toString()}`)
    if (range?.minimum == null || range.maximum == null) return null
    return { minimum: Math.floor(Number(range.minimum)), maximum: Math.ceil(Number(range.maximum)) }
}

export function getProfessional(id: string): Promise<Professional> {
    return apiRequest<Professional>(`/professionals/${encodeURIComponent(id)}`)
}
