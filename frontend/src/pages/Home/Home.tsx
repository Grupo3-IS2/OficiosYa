import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import CategoryCard from './components/CategoryCard'
import Header from '../../components/Header/Header'
import Icon from '../../components/Icon/Icon'
import ProfessionalCard from './components/ProfessionalCard'
import SearchBar from './components/SearchBar'
import heroImage from '../../assets/hero-home.svg'
import { getProfessionals } from '../../services/professionalService'
import { getTrades } from '../../services/userService'
import type { Professional } from '../../types/Professional'
import type { Trade } from '../../types/Professional'
import {
    categoryStyles,
    popularSearches,
} from './homeData'
import { orderProfessionals } from './professionalOrder'
import type { ProfessionalOrder } from './professionalOrder'
import './Home.css'

function Home() {
    const [trades, setTrades] = useState<Trade[]>([])
    const [loadingTrades, setLoadingTrades] = useState(true)
    const [tradesError, setTradesError] = useState(false)
    const [professionals, setProfessionals] = useState<Professional[]>([])
    const [loadingProfessionals, setLoadingProfessionals] = useState(true)
    const [professionalsError, setProfessionalsError] = useState(false)
    const [order, setOrder] = useState<ProfessionalOrder>(null)

    useEffect(() => {
        let active = true
        void getTrades().then(response => {
            if (active) setTrades(response)
        }).catch(() => {
            if (active) setTradesError(true)
        }).finally(() => {
            if (active) setLoadingTrades(false)
        })
        return () => { active = false }
    }, [])

    useEffect(() => {
        let active = true
        void getProfessionals().then(response => {
            if (active) setProfessionals(response)
        }).catch(() => {
            if (active) setProfessionalsError(true)
        }).finally(() => {
            if (active) setLoadingProfessionals(false)
        })
        return () => { active = false }
    }, [])

    const heroStyle = {
        '--hero-image': `url(${heroImage})`,
    } as CSSProperties
    const orderedProfessionals = orderProfessionals(professionals, order)
    const availableSearches = popularSearches.filter(search => trades.some(trade =>
        trade.name.localeCompare(search, 'es', { sensitivity: 'base' }) === 0))

    return (
        <div id="top">
            <Header />

            <main>
                <section className="hero" style={heroStyle}>
                    <div className="hero-copy">
                        <SearchBar />

                        {availableSearches.length > 0 && <div className="popular-searches">
                            <span>Búsquedas populares:</span>
                            {availableSearches.map((search) => (
                                <button key={search} type="button">
                                    {search}
                                </button>
                            ))}
                        </div>}
                    </div>
                </section>

                <div className="content">
                    <section className="categories" aria-label="Categorías">
                        {loadingTrades ? (
                            <p role="status">Cargando rubros...</p>
                        ) : tradesError ? (
                            <p role="alert">No pudimos cargar los rubros. Intentá de nuevo más tarde.</p>
                        ) : trades.length === 0 ? (
                            <p>Todavía no hay rubros disponibles.</p>
                        ) : (
                            <div className="category-list">
                                {trades.map((trade, index) => (
                                    <CategoryCard key={trade.id} label={trade.name} {...categoryStyles[index % categoryStyles.length]} />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="professionals">
                        <div className="section-heading">
                            <div>
                                <h2>Profesionales</h2>
                                <p>Conocé los perfiles disponibles en OficiosYa.</p>
                            </div>
                        </div>

                        <div className="filters" aria-label="Ordenar profesionales mostrados">
                            <button type="button" disabled title="Orden por cercanía próximamente">
                                <Icon name="location" /> Cerca
                            </button>
                            <button className={order?.startsWith('price') ? 'active' : ''} type="button" aria-pressed={order?.startsWith('price') ?? false} onClick={() => setOrder(order === 'price-asc' ? 'price-desc' : 'price-asc')}>
                                <Icon name="money" /> Precio {order === 'price-asc' ? '↑' : order === 'price-desc' ? '↓' : ''}
                            </button>
                            <button type="button" disabled title="Orden por disponibilidad próximamente">
                                <Icon name="calendar" /> Disponibilidad
                            </button>
                            <button className={order?.startsWith('rating') ? 'active' : ''} type="button" aria-pressed={order?.startsWith('rating') ?? false} onClick={() => setOrder(order === 'rating-desc' ? 'rating-asc' : 'rating-desc')}>
                                <Icon name="star" /> Calificación {order === 'rating-desc' ? '↓' : order === 'rating-asc' ? '↑' : ''}
                            </button>
                        </div>

                        {loadingProfessionals ? (
                            <p role="status">Cargando profesionales...</p>
                        ) : professionalsError ? (
                            <p role="alert">No pudimos cargar los profesionales. Intentá de nuevo más tarde.</p>
                        ) : professionals.length === 0 ? (
                            <p>Todavía no hay profesionales publicados.</p>
                        ) : (
                            <div className="professional-grid">
                                {orderedProfessionals.map((professional) => (
                                    <ProfessionalCard
                                        key={professional.id}
                                        professional={professional}
                                    />
                                ))}
                            </div>
                        )}

                    </section>
                </div>
            </main>
        </div>
    )
}

export default Home
