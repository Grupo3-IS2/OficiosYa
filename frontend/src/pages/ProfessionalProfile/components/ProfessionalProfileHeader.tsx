import avatarPlaceholder from '../../../assets/avatar-placeholder.svg'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import type { ExpertiseTrade, Professional } from '../../../types/Professional'

interface ProfessionalProfileHeaderProps {
    professional: Professional
    selectedTrade: ExpertiseTrade | null
}

function ProfessionalProfileHeader({ professional, selectedTrade }: ProfessionalProfileHeaderProps) {
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
                <Button type="button" disabled={selectedTrade === null}>
                    {selectedTrade === null ? 'Seleccione un rubro' : 'Solicitar servicio'}
                </Button>
            </div>
        </section>
    )
}

export default ProfessionalProfileHeader
