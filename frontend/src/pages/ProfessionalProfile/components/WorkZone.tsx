import Icon from '../../../components/Icon/Icon'

interface WorkZoneProps {
    workingLocation: string
}

function WorkZone({ workingLocation }: WorkZoneProps) {
    const location = workingLocation.trim()
    const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
    const mapUrl = location && googleMapsApiKey
        ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(googleMapsApiKey)}&q=${encodeURIComponent(location)}&language=es&region=uy`
        : null

    return (
        <section className="public-profile-section" aria-labelledby="work-zone-heading">
            <h2 id="work-zone-heading">Zona donde trabaja</h2>
            {location
                ? <>
                    <div className="work-zone"><Icon name="location" />{location}</div>
                    {mapUrl
                        ? <iframe
                            className="work-zone-map"
                            title={`Mapa de la zona donde trabaja ${location}`}
                            src={mapUrl}
                            loading="lazy"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                        />
                        : <div className="work-zone-map-placeholder">
                            El mapa estará disponible cuando se configure Google Maps.
                        </div>}
                </>
                : <p className="profile-empty">La zona de trabajo todavía no fue informada.</p>}
        </section>
    )
}

export default WorkZone
