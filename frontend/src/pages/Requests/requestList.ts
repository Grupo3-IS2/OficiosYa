import type { JobRequest } from '../../types/JobRequest'

export type RequestFilter = 'all' | 'pending' | 'accepted' | 'completed' | 'cancelled'
export type RequestOrder = 'newest' | 'oldest'

export interface RequestGroup {
    dateKey: string
    requests: JobRequest[]
}

export function serviceSummary(request: JobRequest): string {
    const firstTask = request.tasks[0]
    if (!firstTask) return 'Solicitud de servicio'

    const additionalTasks = request.tasks.length - 1
    if (additionalTasks === 0) return firstTask.tradeName

    return `${firstTask.tradeName} + ${additionalTasks} ${additionalTasks === 1 ? 'tarea' : 'tareas'}`
}

export function requestDescription(request: JobRequest): string {
    return request.tasks[0]?.description ?? 'Sin descripción.'
}

function matchesFilter(request: JobRequest, filter: RequestFilter): boolean {
    if (filter === 'all') return true
    if (filter === 'pending') return request.status === 'PROPOSED'
    if (filter === 'accepted') return request.status === 'ACCEPTED'
    if (filter === 'completed') return request.status === 'COMPLETED'
    return request.status === 'CANCELLED' || request.status === 'REJECTED'
}

export function filterAndOrderRequests(
    requests: JobRequest[],
    filter: RequestFilter,
    order: RequestOrder,
): JobRequest[] {
    const filtered = requests.filter(request => matchesFilter(request, filter))

    return [...filtered].sort((left, right) => {
        const difference = Date.parse(right.createdAt) - Date.parse(left.createdAt)
        return order === 'newest' ? difference : -difference
    })
}

export function groupRequestsByDate(requests: JobRequest[]): RequestGroup[] {
    const groups = new Map<string, JobRequest[]>()

    requests.forEach(request => {
        const dateKey = localDateKey(request.createdAt)
        groups.set(dateKey, [...(groups.get(dateKey) ?? []), request])
    })

    return [...groups].map(([dateKey, groupedRequests]) => ({ dateKey, requests: groupedRequests }))
}

export function localDateKey(timestamp: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'America/Montevideo',
    }).formatToParts(new Date(timestamp))
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
    return `${value('year')}-${value('month')}-${value('day')}`
}
