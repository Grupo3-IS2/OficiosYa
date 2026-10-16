import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import CategoryList from './components/CategoryList'
import FilterPanel from './components/FilterPanel'
import Header from '../../components/Header/Header'
import Icon from '../../components/Icon/Icon'
import ProfessionalCard from './components/ProfessionalCard'
import SearchBar from './components/SearchBar'
import SortControl from './components/SortControl'
import heroImage from '../../assets/hero-home.svg'
import { getProfessionalSchedule } from '../../services/scheduleService'
import { getTrades } from '../../services/userService'
import type { Trade } from '../../types/Professional'
import type { Schedule } from '../../types/Schedule'
import { rangeLabel } from './professionalAvailability'
import { currentWeek } from '../ProfessionalProfile/scheduleCalendar'
import { popularSearches } from './homeData'
import type { ProfessionalOrder } from './professionalOrder'
import { activeFilterCount, emptyProfessionalFilters, tradeSelectionName } from './professionalFilters'
import { useProfessionalSearch } from './useProfessionalSearch'
import type { ProfessionalFilters } from './professionalFilters'
import './Home.css'

function Home() {
    const [trades, setTrades] = useState<Trade[]>([])
    const [loadingTrades, setLoadingTrades] = useState(true)
    const [tradesError, setTradesError] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedTradeIds, setSelectedTradeIds] = useState<number[]>([])
    const [filters, setFilters] = useState<ProfessionalFilters>(emptyProfessionalFilters)
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [order, setOrder] = useState<ProfessionalOrder>('relevance')
    // The search filters and orders them, a page at a time: the next one loads when the list's end comes into view.
    const found = useProfessionalSearch({ query: searchQuery, tradeIds: selectedTradeIds, filters, order })
    const { professionals } = found
    const listEnd = useRef<HTMLDivElement>(null)
    // This week's schedules of the professionals listed, for their cards; each is asked for once.
    const [schedules, setSchedules] = useState<Map<string, Schedule[] | null>>(new Map())
    const askedSchedules = useRef(new Set<string>())

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
        const { start, end } = currentWeek()
        // Only the ones just loaded: each card fills in as its answer arrives.
        for (const professional of professionals) {
            if (askedSchedules.current.has(professional.id)) continue
            askedSchedules.current.add(professional.id)
            const store = (list: Schedule[] | null) => setSchedules(current => new Map(current).set(professional.id, list))
            getProfessionalSchedule(professional.id, start, end).then(store).catch(() => store(null))
        }
    }, [professionals])

    // The end of the list in view (or close to it): the next page.
    const loadMore = useRef(found.loadMore)
    useEffect(() => { loadMore.current = found.loadMore })
    const canLoadMore = found.hasMore && !found.moreFailed
    useEffect(() => {
        const element = listEnd.current
        if (!element || !canLoadMore) return
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) loadMore.current()
        }, { rootMargin: '200px 0px' })
        observer.observe(element)
        return () => observer.disconnect()
    }, [canLoadMore, professionals.length])

    const heroStyle = { '--hero-image': `url(${heroImage})` } as CSSProperties
    const selectedTradesName = tradeSelectionName(trades.filter(trade => selectedTradeIds.includes(trade.id)).map(trade => trade.name))
    const appliedFilterCount = activeFilterCount(filters)
    const availableSearches = popularSearches.filter(search => trades.some(trade =>
        trade.name.localeCompare(search, 'es', { sensitivity: 'base' }) === 0))

    function searchProfessionals(query: string) {
        setSearchQuery(query)
    }

    /** The price range depends on the trades, so changing them drops the price chosen for the old ones. */
    function selectTrades(tradeIds: number[]) {
        setSelectedTradeIds(tradeIds)
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
                        <SearchBar appliedQuery={searchQuery} onSearch={searchProfessionals} />
                        {availableSearches.length > 0 && <div className="popular-searches">
                            <span>Búsquedas populares:</span>
                            {availableSearches.map(search => {
                                const trade = trades.find(item => item.name.localeCompare(search, 'es', { sensitivity: 'base' }) === 0)
                                return <button key={search} type="button" onClick={() => selectTrades(trade ? [trade.id] : [])}>{search}</button>
                            })}
                        </div>}
                    </div>
                </section>

                <div className="content">
                    <section className="categories" aria-label="Categorías">
                        {loadingTrades ? <output>Cargando rubros...</output>
                            : tradesError ? <p role="alert">No pudimos cargar los rubros. Intentá de nuevo más tarde.</p>
                                : trades.length === 0 ? <p>Todavía no hay rubros disponibles.</p>
                                    : <CategoryList trades={trades} selectedTradeIds={selectedTradeIds} onChange={selectTrades} />}
                    </section>

                    <section id="professionals" className="professionals">
                        <div className="section-heading">
                            <div>
                                <h2>{selectedTradesName || 'Profesionales'}</h2>
                                <p>{selectedTradeIds.length === 0 ? 'Conocé los perfiles disponibles en OficiosYa.' : selectedTradeIds.length === 1 ? 'Profesionales disponibles en este rubro.' : 'Profesionales disponibles en estos rubros.'}</p>
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
                            {filters.availability !== null && <button type="button" onClick={() => setFilters(current => ({ ...current, availability: null }))}>Disponible {rangeLabel(filters.availability)} <span aria-hidden="true">×</span></button>}
                            {filters.minimumRating !== null && <button type="button" onClick={() => setFilters(current => ({ ...current, minimumRating: null }))}>{filters.minimumRating}★ o más <span aria-hidden="true">×</span></button>}
                            <button type="button" className="active-filters__clear" onClick={clearAllFilters}>Limpiar filtros</button>
                        </div>}

                        {found.status === 'loading' ? <output>Cargando profesionales...</output>
                            : found.status === 'error' ? <p role="alert">No pudimos cargar los profesionales. Intentá de nuevo más tarde.</p>
                                : professionals.length === 0 ? (selectedTradeIds.length > 0 || appliedFilterCount > 0
                                    ? <div className="professionals-empty"><h3>No encontramos profesionales con estos filtros</h3><p>Probá ampliar el rango o limpiar algún filtro.</p><button type="button" onClick={clearAllFilters}>Limpiar filtros</button></div>
                                    : <p>{searchQuery ? 'No encontramos profesionales con ese nombre.' : 'Todavía no hay profesionales publicados.'}</p>)
                                    : <>
                                        <div className="professional-grid">
                                            {professionals.map(professional => <ProfessionalCard key={professional.id} professional={professional} selectedTradeIds={selectedTradeIds} schedules={schedules.get(professional.id)} />)}
                                        </div>
                                        <div ref={listEnd} className="professionals-more">
                                            {found.loadingMore && <output>Cargando más profesionales...</output>}
                                            {found.moreFailed && <p role="alert">No pudimos cargar más profesionales. <button type="button" onClick={found.loadMore}>Reintentar</button></p>}
                                        </div>
                                    </>}
                    </section>
                </div>
            </main>
            {filtersOpen && <FilterPanel filters={filters} trades={trades} tradeIds={selectedTradeIds} query={searchQuery} onApply={(nextFilters, nextTradeIds) => { setSelectedTradeIds(nextTradeIds); setFilters(nextFilters); setFiltersOpen(false) }} onClose={() => setFiltersOpen(false)} />}
        </div>
    )
}

export default Home
