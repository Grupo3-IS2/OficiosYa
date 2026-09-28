import type { ExpertiseTrade } from '../../../types/Professional'

interface ProfessionalServicesProps {
    trades: ExpertiseTrade[]
    selectedTradeId: number | null
    onSelect: (tradeId: number) => void
}

function ProfessionalServices({ trades, selectedTradeId, onSelect }: ProfessionalServicesProps) {
    return (
        <section className="public-profile-section" aria-labelledby="services-heading">
            <h2 id="services-heading">Servicios</h2>
            {trades.length > 0
                ? <div className="service-tags">{trades.map(trade => (
                    <button
                        className={trade.tradeId === selectedTradeId ? 'is-selected' : ''}
                        type="button"
                        aria-pressed={trade.tradeId === selectedTradeId}
                        key={trade.id}
                        onClick={() => onSelect(trade.tradeId)}
                    >
                        {trade.tradeName}
                    </button>
                ))}</div>
                : <p className="profile-empty">Este profesional todavía no publicó sus servicios.</p>}
        </section>
    )
}

export default ProfessionalServices
