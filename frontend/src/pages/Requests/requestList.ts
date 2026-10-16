import type { JobRequest, RequestParty } from '../../types/JobRequest'

/** 'awaiting' is what waits for the viewer's answer, whatever its status: it depends on who is looking. */
export type RequestFilter = 'all' | 'awaiting' | 'pending' | 'accepted' | 'completed' | 'cancelled'
export type RequestOrder = 'newest' | 'oldest'
/**
 * Which side of the requests to see. A professional is also a client: they get requests to do a job
 * (received) and make their own to other professionals (sent).
 */
export type RequestDirection = 'all' | 'received' | 'sent'

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

function matchesFilter(request: JobRequest, filter: RequestFilter, viewerId: string | undefined): boolean {
    if (filter === 'all') return true
    if (filter === 'awaiting') return awaitsAnswerFrom(request, viewerId)
    if (filter === 'pending') return request.status === 'PROPOSED'
    if (filter === 'accepted') return request.status === 'ACCEPTED' || request.status === 'RESCHEDULE_REQUESTED'
    if (filter === 'completed') return request.status === 'COMPLETED'
    return request.status === 'CANCELLED' || request.status === 'REJECTED'
}

/** Who asked to reschedule. Requests from before either side could ask were always the client's. */
export function rescheduleRequester(request: JobRequest): RequestParty {
    return request.rescheduleRequestedBy ?? 'CLIENT'
}

/** A pending reschedule is answered by the side that didn't ask for it. */
export function answersReschedule(request: JobRequest, party: RequestParty): boolean {
    return request.status === 'RESCHEDULE_REQUESTED' && rescheduleRequester(request) !== party
}

/** The side the viewer is on in the request. */
export function viewerParty(request: JobRequest, viewerId: string | undefined): RequestParty {
    return request.clientId === viewerId ? 'CLIENT' : 'PROFESSIONAL'
}

/**
 * Something waits for the viewer to accept or reject it: a request made to them as a professional,
 * or a reschedule the other side asked for.
 */
export function awaitsAnswerFrom(request: JobRequest, viewerId: string | undefined): boolean {
    if (!viewerId) return false
    if (request.status === 'PROPOSED') return request.professionalId === viewerId
    return answersReschedule(request, viewerParty(request, viewerId))
}

export function filterByDirection(requests: JobRequest[], direction: RequestDirection, viewerId: string | undefined): JobRequest[] {
    if (direction === 'all') return requests
    return requests.filter(request => direction === 'received'
        ? request.professionalId === viewerId
        : request.clientId === viewerId)
}

export function filterAndOrderRequests(
    requests: JobRequest[],
    filter: RequestFilter,
    order: RequestOrder,
    viewerId?: string,
): JobRequest[] {
    const filtered = requests.filter(request => matchesFilter(request, filter, viewerId))

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
