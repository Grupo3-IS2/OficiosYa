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

export interface Professional {
    id: string
    name: string
    profileImageUrl: string | null
    workingLocation: string
    description: string | null
    rating: number | null
    expertiseTrades: ExpertiseTrade[]
}
