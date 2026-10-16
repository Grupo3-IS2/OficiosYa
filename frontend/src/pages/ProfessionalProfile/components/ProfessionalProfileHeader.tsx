import avatarPlaceholder from '../../../assets/avatar-placeholder.svg'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import type { ExpertiseTrade, Professional } from '../../../types/Professional'

interface ProfessionalProfileHeaderProps {
    professional: Professional
    selectedTrade: ExpertiseTrade | null
    onRequestService: () => void
}

function ProfessionalProfileHeader({ professional, selectedTrade, onRequestService }: Readonly<ProfessionalProfileHeaderProps>) {
    const startingPrice = selectedTrade?.minimumHourlyWage ?? (professional.expertiseTrades.length > 0
        ? Math.min(...professional.expertiseTrades.map(trade => trade.minimumHourlyWage))
        : null)

    return (
        <section className="profile-summary" aria-labelledby="professional-name">
            <img
                className="profile-summary__avatar"
                src={professional.profileImageUrl || avatarPlaceholder}
                alt={`Foto de ${professional.name}`}
                onError={event => { event.currentTarget.src = avatarPlaceholder }}
            />

            <div className="profile-summary__identity">
                <h1 id="professional-name">{professional.name}</h1>
                {selectedTrade && <span className="profile-summary__trade">{selectedTrade.tradeName}</span>}
                <div className={`profile-summary__rating${professional.rating === null ? ' is-empty' : ''}`}>
                    <Icon name="star" />
                    {professional.rating === null
                        ? <span>Sin calificaciones</span>
                        : <><strong>{professional.rating.toFixed(1)}</strong><span>de 10</span></>}
                </div>
            </div>

            <div className="profile-summary__action">
                {startingPrice !== null && (
                    <span className="profile-summary__price">
                        Desde / hora
                        <strong>${startingPrice.toLocaleString('es-UY')}</strong>
                    </span>
                )}
                <div className="profile-summary__actions">
                    <span title="El chat estará disponible próximamente">
                        <Button
                            type="button"
                            variant="ghost"
                            className="profile-summary__chat"
                            disabled
                            aria-describedby="chat-coming-soon"
                        >
                            <Icon name="message" /> Hablar por chat
                        </Button>
                    </span>
                    <span id="chat-coming-soon" className="visually-hidden">Chat disponible próximamente.</span>
                    {/* The service is chosen in the request itself, if it wasn't chosen on the profile already */}
                    <Button
                        type="button"
                        disabled={professional.expertiseTrades.length === 0}
                        title={professional.expertiseTrades.length === 0 ? 'Este profesional todavía no publicó servicios.' : undefined}
                        onClick={onRequestService}
                    >
                        Solicitar servicio
                    </Button>
                </div>
            </div>
        </section>
    )
}

export default ProfessionalProfileHeader
