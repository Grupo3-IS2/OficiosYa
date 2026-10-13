import { useEffect, useState } from 'react'
import { getCurrentUser } from '../../services/authService'
import { getMyJobRequests } from '../../services/jobRequestService'
import { awaitsAnswerFrom } from '../../pages/Requests/requestList'

const EVENT = 'oficiosya:awaiting-answers'
const REQUESTS_PATH = '/mis-solicitudes'

/** The last count anyone knew of on this page load, and the one lookup for it: every header shares them. */
let known: number | null = null
let lookup: Promise<number> | null = null

/**
 * Mis solicitudes already has the requests, and tells the header each time what waits changes (an answer
 * from the detail, a card's "Aceptar"): the header follows without asking the backend again.
 */
export function publishAwaitingAnswers(count: number): void {
    known = count
    window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: count }))
}

/**
 * How many requests wait for the logged in user's answer (the same as "Por responder"), for the
 * alert on the header's "Mis solicitudes". It is asked once per page load; it is not live.
 */
export function useAwaitingAnswers(enabled: boolean): number {
    const [count, setCount] = useState(known ?? 0)

    useEffect(() => {
        if (!enabled) return
        const follow = (event: Event) => setCount((event as CustomEvent<number>).detail)
        window.addEventListener(EVENT, follow)

        // On Mis solicitudes the page loads the requests itself and publishes the count
        if (known === null && window.location.pathname !== REQUESTS_PATH) {
            const viewerId = getCurrentUser()?.id
            lookup ??= getMyJobRequests().then(requests => requests.filter(request => awaitsAnswerFrom(request, viewerId)).length)
            let active = true
            lookup
                .then(found => {
                    known ??= found
                    if (active) setCount(known)
                })
                // Without the count there is just no alert: the header works the same
                .catch(() => { lookup = null })
            return () => {
                active = false
                window.removeEventListener(EVENT, follow)
            }
        }
        return () => window.removeEventListener(EVENT, follow)
    }, [enabled])

    return enabled ? count : 0
}
