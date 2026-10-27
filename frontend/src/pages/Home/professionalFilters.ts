import type { ZonePoint } from '../../components/ZonePicker/ZonePicker'
import type { Professional } from '../../types/Professional'
import type { DayRange } from './professionalAvailability.ts'

export interface ProfessionalFilters {
    location: string
    /** Where the service is needed, chosen on the map: only professionals whose area covers it. */
    point: ZonePoint | null
    /** "A menos de X km", from the point: only with one. */
    maxDistanceKm: number | null
    minimumPrice: number | null
    maximumPrice: number | null
    minimumRating: number | null
    /** The days the service is needed: only professionals with free time on them. */
    availability: DayRange | null
}

export interface PriceRange {
    minimum: number
    maximum: number
}

export const emptyProfessionalFilters: ProfessionalFilters = {
    location: '',
    point: null,
    maxDistanceKm: null,
    minimumPrice: null,
    maximumPrice: null,
    minimumRating: null,
    availability: null,
}

/** No trade chosen means every trade. */
export function tradesFor(professional: Professional, tradeIds: readonly number[]) {
    return tradeIds.length === 0
        ? professional.expertiseTrades
        : professional.expertiseTrades.filter(trade => tradeIds.includes(trade.tradeId))
}

/** Tapping a trade card: chooses only that trade, or none if it was the only one chosen. */
export function selectOnlyTrade(tradeIds: readonly number[], tradeId: number) {
    return tradeIds.length === 1 && tradeIds[0] === tradeId ? [] : [tradeId]
}

/** Adds the trade to the selection, or takes it out if it was already there. */
export function toggleTrade(tradeIds: readonly number[], tradeId: number) {
    return tradeIds.includes(tradeId) ? tradeIds.filter(id => id !== tradeId) : [...tradeIds, tradeId]
}

export function activeFilterCount(filters: ProfessionalFilters) {
    return Number(Boolean(filters.location.trim()))
        + Number(filters.minimumPrice !== null || filters.maximumPrice !== null)
        + Number(filters.minimumRating !== null)
        + Number(filters.availability !== null)
}

/** How the chosen trades are named in a heading: "Plomería", "Plomería y Electricista", "4 rubros". */
export function tradeSelectionName(names: readonly string[]) {
    if (names.length <= 1) return names[0] ?? ''
    if (names.length <= 3) return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
    return `${names.length} rubros`
}
