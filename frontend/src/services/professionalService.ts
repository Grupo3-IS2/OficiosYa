import type { Professional } from '../types/Professional'
import { apiRequest } from './api'

interface ProfessionalPage {
    content: Professional[]
    totalPages: number
}

export async function getProfessionals(query = ''): Promise<Professional[]> {
    const professionals: Professional[] = []
    const searchQuery = query.trim() ? `&query=${encodeURIComponent(query.trim())}` : ''
    let pageNumber = 0
    let totalPages: number

    do {
        const page = await apiRequest<ProfessionalPage>(`/professionals/search?page=${pageNumber}&size=20${searchQuery}`)
        professionals.push(...page.content)
        totalPages = page.totalPages
        pageNumber++
    } while (pageNumber < totalPages)

    return professionals
}

export function getProfessional(id: string): Promise<Professional> {
    return apiRequest<Professional>(`/professionals/${encodeURIComponent(id)}`)
}
