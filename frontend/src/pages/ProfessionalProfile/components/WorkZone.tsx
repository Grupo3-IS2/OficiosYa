import Icon from '../../../components/Icon/Icon'
import ZoneMap from '../../../components/ZoneMap/ZoneMap'
import { useZoneLookup } from '../../../components/ZoneMap/useZoneLookup'
import type { ServiceArea } from '../../../types/Professional'

interface WorkZoneProps {
    workingLocation: string
    serviceArea: ServiceArea | null
}

function WorkZone({ workingLocation, serviceArea }: Readonly<WorkZoneProps>) {
    const location = workingLocation.trim()
    // With an area its point is already known; the name is only searched for profiles from before it.
    const lookup = useZoneLookup(serviceArea ? '' : location)
    const map = serviceArea
        ? { status: 'found' as const, place: { lat: serviceArea.latitude, lon: serviceArea.longitude } }
        : lookup

    return (
        <section className="public-profile-section" aria-labelledby="work-zone-heading">
            <h2 id="work-zone-heading">Zona donde trabaja</h2>
            {location
                ? <>
                    <div className="work-zone"><Icon name="location" />{location}{serviceArea && ` · hasta ${serviceArea.radiusKm} km`}</div>
                    {map.status === 'found'
                        ? <ZoneMap focus={map.place} radiusKm={serviceArea?.radiusKm} label={`Mapa de la zona donde trabaja ${location}`} />
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
