import type { Professional } from '../../types/Professional'

export type ProfessionalOrder = 'price-asc' | 'price-desc' | 'rating-desc' | 'rating-asc' | null

export function orderProfessionals(professionals: Professional[], order: ProfessionalOrder): Professional[] {
    if (!order) return professionals

    return [...professionals].sort((first, second) => {
        if (order.startsWith('price')) {
            const firstPrice = Math.min(...first.expertiseTrades.map(trade => trade.minimumHourlyWage))
            const secondPrice = Math.min(...second.expertiseTrades.map(trade => trade.minimumHourlyWage))
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
