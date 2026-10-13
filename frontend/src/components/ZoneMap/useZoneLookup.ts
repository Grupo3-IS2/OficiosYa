import { useEffect, useState } from 'react'
import { lookupBestZone, sharedZoneCache, type ZonePlace } from '../../services/zoneMap'

export type ZoneLookup =
    | { status: 'loading' }
    | { status: 'found'; place: ZonePlace }
    | { status: 'not-found' }
    | { status: 'error' }

/** What a lookup ended in, and for which text: a result for another place is not this one's. */
interface Outcome {
    location: string
    state: Exclude<ZoneLookup, { status: 'loading' }>
}

/**
 * Finds a place written as text (a work zone, the address of a job) on OpenStreetMap, to show it on a
 * ZoneMap. Lookups are shared and cached, so the same place is only searched once.
 */
export function useZoneLookup(text: string): ZoneLookup {
    const location = text.trim()
    const [outcome, setOutcome] = useState<Outcome | null>(null)

    useEffect(() => {
        if (!location) return

        // The search is not cancelled (another view of this place may be waiting on it): its answer is
        // just ignored if this effect is already gone.
        let active = true

        lookupBestZone(location, { cache: sharedZoneCache() })
            .then(place => { if (active) setOutcome({ location, state: place ? { status: 'found', place } : { status: 'not-found' } }) })
            .catch(() => { if (active) setOutcome({ location, state: { status: 'error' } }) })

        return () => { active = false }
    }, [location])

    // Searching until there is an answer for this place.
    return outcome?.location === location ? outcome.state : { status: 'loading' }
}
