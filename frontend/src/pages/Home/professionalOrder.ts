import type { Professional } from '../../types/Professional'
import { tradesFor } from './professionalFilters.ts'

export type ProfessionalOrder = 'relevance' | 'distance' | 'price-asc' | 'price-desc' | 'rating-desc' | 'rating-asc' | null

export function orderProfessionals(professionals: Professional[], order: ProfessionalOrder, tradeId: number | null = null): Professional[] {
    if (!order || order === 'relevance' || order === 'distance') return professionals

    return [...professionals].sort((first, second) => {
        if (order.startsWith('price')) {
            const firstPrice = Math.min(...tradesFor(first, tradeId).map(trade => trade.minimumHourlyWage))
            const secondPrice = Math.min(...tradesFor(second, tradeId).map(trade => trade.minimumHourlyWage))
            if (!Number.isFinite(firstPrice)) return Number.isFinite(secondPrice) ? 1 : first.name.localeCompare(second.name, 'es')
            if (!Number.isFinite(secondPrice)) return -1
            const difference = order === 'price-asc' ? firstPrice - secondPrice : secondPrice - firstPrice
            if (difference !== 0) return difference
        } else {
            if (first.rating === null) return second.rating === null ? first.name.localeCompare(second.name, 'es') : 1
            if (second.rating === null) return -1
            const difference = order === 'rating-desc' ? second.rating - first.rating : first.rating - second.rating
            if (difference !== 0) return difference
        }
        return first.name.localeCompare(second.name, 'es')
    })
}
