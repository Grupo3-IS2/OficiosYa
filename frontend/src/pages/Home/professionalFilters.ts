import type { Professional } from '../../types/Professional'

export interface ProfessionalFilters {
    location: string
    minimumPrice: number | null
    maximumPrice: number | null
    minimumRating: number | null
}

export interface PriceRange {
    minimum: number
    maximum: number
}

export const emptyProfessionalFilters: ProfessionalFilters = {
    location: '',
    minimumPrice: null,
    maximumPrice: null,
    minimumRating: null,
}

export function tradesFor(professional: Professional, tradeId: number | null) {
    return tradeId === null
        ? professional.expertiseTrades
        : professional.expertiseTrades.filter(trade => trade.tradeId === tradeId)
}

export function priceRangeFor(professionals: Professional[], tradeId: number | null): PriceRange | null {
    const trades = professionals.flatMap(professional => tradesFor(professional, tradeId))
    if (trades.length === 0) return null

    return {
        minimum: Math.floor(Math.min(...trades.map(trade => trade.minimumHourlyWage))),
        maximum: Math.ceil(Math.max(...trades.map(trade => trade.maximumHourlyWage))),
    }
}

export function filterProfessionals(professionals: Professional[], tradeId: number | null, filters: ProfessionalFilters) {
    const normalizedLocation = filters.location.trim().toLocaleLowerCase('es')

    return professionals.filter(professional => {
        const relevantTrades = tradesFor(professional, tradeId)
        if (tradeId !== null && relevantTrades.length === 0) return false
        if (normalizedLocation && !professional.workingLocation.toLocaleLowerCase('es').includes(normalizedLocation)) return false
        if (filters.minimumRating !== null && (professional.rating === null || professional.rating < filters.minimumRating)) return false
        if ((filters.minimumPrice !== null || filters.maximumPrice !== null) && !relevantTrades.some(trade =>
            (filters.minimumPrice === null || trade.maximumHourlyWage >= filters.minimumPrice)
            && (filters.maximumPrice === null || trade.minimumHourlyWage <= filters.maximumPrice))) return false
        return true
    })
}

export function activeFilterCount(filters: ProfessionalFilters) {
    return Number(Boolean(filters.location.trim()))
        + Number(filters.minimumPrice !== null || filters.maximumPrice !== null)
        + Number(filters.minimumRating !== null)
}
