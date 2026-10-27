import { useEffect, useState } from 'react'
import { getCurrentUser } from '../../services/authService'
import { getMyJobRequests } from '../../services/jobRequestService'
import { awaitsAnswerFrom } from '../../pages/Requests/requestList'
import { onChatEvent } from '../../services/chatSocket'

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

function countAwaiting(): Promise<number> {
    const viewerId = getCurrentUser()?.id
    return getMyJobRequests().then(requests => requests.filter(request => awaitsAnswerFrom(request, viewerId)).length)
}

/**
 * How many requests wait for the logged in user's answer (the same as "Por responder"), for the
 * alert on the header's "Mis solicitudes". It is asked once per page load, and again when a job
 * changes (the socket's job-updates) or pushes may have been missed.
 */
export function useAwaitingAnswers(enabled: boolean): number {
    const [count, setCount] = useState(known ?? 0)

    useEffect(() => {
        if (!enabled) return
        const follow = (event: Event) => setCount((event as CustomEvent<number>).detail)
        window.addEventListener(EVENT, follow)
        // On Mis solicitudes the page reloads on these pushes itself and publishes the count
        const stopLive = window.location.pathname === REQUESTS_PATH
            ? () => {}
            : onChatEvent(event => {
                if (event !== 'message') countAwaiting().then(publishAwaitingAnswers).catch(() => {})
            })

        // On Mis solicitudes the page loads the requests itself and publishes the count
        if (known === null && window.location.pathname !== REQUESTS_PATH) {
            lookup ??= countAwaiting()
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
                stopLive()
            }
        }
        return () => {
            window.removeEventListener(EVENT, follow)
            stopLive()
        }
    }, [enabled])

    return enabled ? count : 0
}
