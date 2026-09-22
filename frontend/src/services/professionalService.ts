import type { Professional } from '../types/Professional'
import { apiRequest } from './api'

interface ProfessionalPage {
    content: Professional[]
}

export async function getProfessionals(): Promise<Professional[]> {
    const page = await apiRequest<ProfessionalPage>('/professional/search?size=20')
    return page.content
}
