import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import CategoryCard from './components/CategoryCard'
import FilterPanel from './components/FilterPanel'
import Header from '../../components/Header/Header'
import Icon from '../../components/Icon/Icon'
import ProfessionalCard from './components/ProfessionalCard'
import SearchBar from './components/SearchBar'
import SortControl from './components/SortControl'
import heroImage from '../../assets/hero-home.svg'
import { getProfessionals } from '../../services/professionalService'
import { getTrades } from '../../services/userService'
import type { Professional, Trade } from '../../types/Professional'
import { categoryStyles, popularSearches } from './homeData'
import { orderProfessionals } from './professionalOrder'
import type { ProfessionalOrder } from './professionalOrder'
import { activeFilterCount, emptyProfessionalFilters, filterProfessionals, priceRangeFor } from './professionalFilters'
import type { ProfessionalFilters } from './professionalFilters'
import './Home.css'

function Home() {
    const [trades, setTrades] = useState<Trade[]>([])
    const [loadingTrades, setLoadingTrades] = useState(true)
    const [tradesError, setTradesError] = useState(false)
    const [professionals, setProfessionals] = useState<Professional[]>([])
    const [loadingProfessionals, setLoadingProfessionals] = useState(true)
    const [professionalsError, setProfessionalsError] = useState(false)
    const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null)
    const [filters, setFilters] = useState<ProfessionalFilters>(emptyProfessionalFilters)
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [order, setOrder] = useState<ProfessionalOrder>('relevance')

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

    const heroStyle = { '--hero-image': `url(${heroImage})` } as CSSProperties
    const selectedTrade = trades.find(trade => trade.id === selectedTradeId)
    const priceRange = priceRangeFor(professionals, selectedTradeId)
    const filteredProfessionals = filterProfessionals(professionals, selectedTradeId, filters)
    const orderedProfessionals = orderProfessionals(filteredProfessionals, order, selectedTradeId)
    const appliedFilterCount = activeFilterCount(filters)
    const availableSearches = popularSearches.filter(search => trades.some(trade =>
        trade.name.localeCompare(search, 'es', { sensitivity: 'base' }) === 0))

    function selectTrade(tradeId: number | null) {
        setSelectedTradeId(tradeId)
        setFilters(current => ({ ...current, minimumPrice: null, maximumPrice: null }))
    }

    function clearAllFilters() {
        setFilters(emptyProfessionalFilters)
    }

    return (
        <div id="top" className={filtersOpen ? 'filters-open' : ''}>
            <Header />
            <main>
                <section className="hero" style={heroStyle}>
                    <div className="hero-copy">
                        <SearchBar />
                        {availableSearches.length > 0 && <div className="popular-searches">
                            <span>Búsquedas populares:</span>
                            {availableSearches.map(search => <button key={search} type="button" onClick={() => selectTrade(trades.find(trade => trade.name.localeCompare(search, 'es', { sensitivity: 'base' }) === 0)?.id ?? null)}>{search}</button>)}
                        </div>}
                    </div>
                </section>

                <div className="content">
                    <section className="categories" aria-label="Categorías">
                        {loadingTrades ? <p role="status">Cargando rubros...</p>
                            : tradesError ? <p role="alert">No pudimos cargar los rubros. Intentá de nuevo más tarde.</p>
                                : trades.length === 0 ? <p>Todavía no hay rubros disponibles.</p>
                                    : <div className="category-list">
                                        {trades.map((trade, index) => <CategoryCard key={trade.id} label={trade.name} selected={selectedTradeId === trade.id} onClick={() => selectTrade(selectedTradeId === trade.id ? null : trade.id)} {...categoryStyles[index % categoryStyles.length]} />)}
                                    </div>}
                    </section>

                    <section className="professionals">
                        <div className="section-heading">
                            <div>
                                <h2>{selectedTrade?.name ?? 'Profesionales'}</h2>
                                <p>{selectedTrade ? 'Profesionales disponibles en este rubro.' : 'Conocé los perfiles disponibles en OficiosYa.'}</p>
                            </div>
                        </div>

                        <div className="professional-controls">
                            <button className={`filter-trigger${appliedFilterCount > 0 ? ' has-filters' : ''}${filtersOpen ? ' is-open' : ''}`} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
                                <Icon name="filter" /> Filtros
                                {appliedFilterCount > 0 && <span aria-label={`${appliedFilterCount} filtros activos`}>{appliedFilterCount}</span>}
                            </button>
                            <SortControl value={order} onChange={setOrder} />
                        </div>

                        {appliedFilterCount > 0 && <div className="active-filters" aria-label="Filtros activos">
                            {filters.location && <button type="button" onClick={() => setFilters(current => ({ ...current, location: '' }))}>{filters.location} <span aria-hidden="true">×</span></button>}
                            {(filters.minimumPrice !== null || filters.maximumPrice !== null) && <button type="button" onClick={() => setFilters(current => ({ ...current, minimumPrice: null, maximumPrice: null }))}>
                                {filters.minimumPrice !== null ? `$${filters.minimumPrice.toLocaleString('es-UY')}` : 'Desde el mínimo'} – {filters.maximumPrice !== null ? `$${filters.maximumPrice.toLocaleString('es-UY')}` : 'sin máximo'} <span aria-hidden="true">×</span>
                            </button>}
                            {filters.minimumRating !== null && <button type="button" onClick={() => setFilters(current => ({ ...current, minimumRating: null }))}>{filters.minimumRating}★ o más <span aria-hidden="true">×</span></button>}
                            <button type="button" className="active-filters__clear" onClick={clearAllFilters}>Limpiar filtros</button>
                        </div>}

                        {loadingProfessionals ? <p role="status">Cargando profesionales...</p>
                            : professionalsError ? <p role="alert">No pudimos cargar los profesionales. Intentá de nuevo más tarde.</p>
                                : professionals.length === 0 ? <p>Todavía no hay profesionales publicados.</p>
                                    : orderedProfessionals.length === 0 ? <div className="professionals-empty"><h3>No encontramos profesionales con estos filtros</h3><p>Probá ampliar el rango o limpiar algún filtro.</p><button type="button" onClick={clearAllFilters}>Limpiar filtros</button></div>
                                        : <div className="professional-grid">
                                            {orderedProfessionals.map(professional => <ProfessionalCard key={professional.id} professional={professional} selectedTradeId={selectedTradeId} />)}
                                        </div>}
                    </section>
                </div>
            </main>
            {filtersOpen && <FilterPanel filters={filters} priceRange={priceRange} tradeName={selectedTrade?.name} onApply={nextFilters => { setFilters(nextFilters); setFiltersOpen(false) }} onClose={() => setFiltersOpen(false)} />}
        </div>
    )
}

export default Home
