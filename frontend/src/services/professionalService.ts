import type { Professional } from '../types/Professional'
import { apiRequest } from './api'

interface ProfessionalPage {
    content: Professional[]
    totalPages: number
}

export async function getProfessionals(): Promise<Professional[]> {
    const professionals: Professional[] = []
    let pageNumber = 0
    let totalPages: number

    do {
        const page = await apiRequest<ProfessionalPage>(`/professionals/search?page=${pageNumber}&size=20`)
        professionals.push(...page.content)
        totalPages = page.totalPages
        pageNumber++
    } while (pageNumber < totalPages)

    return professionals
}
