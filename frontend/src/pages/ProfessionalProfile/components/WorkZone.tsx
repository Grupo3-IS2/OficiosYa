import Icon from '../../../components/Icon/Icon'
import ZoneMap from '../../../components/ZoneMap/ZoneMap'
import { useZoneLookup } from '../../../components/ZoneMap/useZoneLookup'

interface WorkZoneProps {
    workingLocation: string
}

function WorkZone({ workingLocation }: Readonly<WorkZoneProps>) {
    const location = workingLocation.trim()
    const map = useZoneLookup(location)

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
