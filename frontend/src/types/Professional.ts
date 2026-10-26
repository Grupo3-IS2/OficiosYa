export interface ExpertiseTrade {
    id: number
    tradeId: number
    tradeName: string
    minimumHourlyWage: number
    maximumHourlyWage: number
}

export interface Trade {
    id: number
    name: string
}

/** The circle a professional covers. In public responses the centre comes rounded to about a kilometre. */
export interface ServiceArea {
    latitude: number
    longitude: number
    radiusKm: number
}

export interface Professional {
    id: string
    name: string
    profileImageUrl: string | null
    workingLocation: string
    /** Null for profiles from before it existed, until the professional picks it. */
    serviceArea: ServiceArea | null
    description: string | null
    rating: number | null
    expertiseTrades: ExpertiseTrade[]
    /** Only in a search from a point: how far, to the nearest half kilometre. */
    distanceKm?: number | null
}
