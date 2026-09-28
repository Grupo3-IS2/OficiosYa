import { useEffect, useState } from 'react'
import Icon from '../../../components/Icon/Icon'
import ZoneMap from '../../../components/ZoneMap/ZoneMap'
import { lookupBestZone, sharedZoneCache, type ZonePlace } from '../../../services/zoneMap'

interface WorkZoneProps {
    workingLocation: string
}

type MapState =
    | { status: 'loading' }
    | { status: 'found'; place: ZonePlace }
    | { status: 'not-found' }
    | { status: 'error' }

/** What a lookup ended in, and for which zone: a result for another zone is not this one's. */
interface Outcome {
    location: string
    state: Exclude<MapState, { status: 'loading' }>
}

function WorkZone({ workingLocation }: Readonly<WorkZoneProps>) {
    const location = workingLocation.trim()
    const [outcome, setOutcome] = useState<Outcome | null>(null)
    // Searching until there is an answer for this zone.
    const map: MapState = outcome?.location === location ? outcome.state : { status: 'loading' }

    useEffect(() => {
        if (!location) return

        // The search is not cancelled (another visit to this zone may be waiting on it): its answer is
        // just ignored if this effect is already gone.
        let active = true

        lookupBestZone(location, { cache: sharedZoneCache() })
            .then(place => { if (active) setOutcome({ location, state: place ? { status: 'found', place } : { status: 'not-found' } }) })
            .catch(() => { if (active) setOutcome({ location, state: { status: 'error' } }) })

        return () => { active = false }
    }, [location])

    return (
        <section className="public-profile-section" aria-labelledby="work-zone-heading">
            <h2 id="work-zone-heading">Zona donde trabaja</h2>
            {location
                ? <>
                    <div className="work-zone"><Icon name="location" />{location}</div>
                    {map.status === 'found'
                        ? <ZoneMap focus={map.place} label={`Mapa de la zona donde trabaja ${location}`} />
                        : <output className="work-zone-map-placeholder">
                            {map.status === 'loading' && 'Buscando la zona en el mapa…'}
                            {map.status === 'not-found' && 'No pudimos ubicar esta zona en el mapa.'}
                            {map.status === 'error' && 'No pudimos cargar el mapa en este momento.'}
                        </output>}
                </>
                : <p className="profile-empty">La zona de trabajo todavía no fue informada.</p>}
        </section>
    )
}

export default WorkZone
