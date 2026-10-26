import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import ZonePicker from '../../../components/ZonePicker/ZonePicker'
import DateRangeCalendar from './DateRangeCalendar'
import { getPriceRange } from '../../../services/professionalService'
import type { Trade } from '../../../types/Professional'
import { dayKey, presetRanges, rangeLabel, type DayRange } from '../professionalAvailability'
import type { PriceRange, ProfessionalFilters } from '../professionalFilters'
import { emptyProfessionalFilters, toggleTrade, tradeSelectionName } from '../professionalFilters'
import './FilterPanel.css'

interface Props {
    filters: ProfessionalFilters
    trades: Trade[]
    /** The trades chosen: none means every trade. */
    tradeIds: readonly number[]
    /** The name searched for: the price range is of the professionals it finds. */
    query: string
    onApply: (filters: ProfessionalFilters, tradeIds: number[]) => void
    onClose: () => void
}

const formatPrice = (price: number) => `$${price.toLocaleString('es-UY')}`
/** How far ahead the calendar goes: agendas are not filled in much further. */
const CALENDAR_DAYS = 90
const MAX_DISTANCES_KM = [2, 5, 10, 25]

export default function FilterPanel({ filters, trades, tradeIds, query, onApply, onClose }: Props) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [draft, setDraft] = useState(filters)
    const [now] = useState(() => new Date())
    const presets = presetRanges(now)
    const today = dayKey(now)
    const lastDay = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + CALENDAR_DAYS))
    // "Personalizar" opens the calendar; a quick choice or "Limpiar filtros" closes it.
    const [calendarOpen, setCalendarOpen] = useState(false)
    const presetChosen = presets.some(({ range }) => draft.availability?.from === range.from && draft.availability.to === range.to)
    const customChosen = draft.availability !== null && !presetChosen
    function chooseAvailability(availability: DayRange | null) {
        setDraft(current => ({ ...current, availability }))
        setCalendarOpen(false)
    }
    const [draftTradeIds, setDraftTradeIds] = useState<number[]>([...tradeIds])
    // The rates on offer for the trades being chosen, from the server: undefined while it answers.
    const [priceRange, setPriceRange] = useState<PriceRange | null | undefined>(undefined)
    const tradeName = tradeSelectionName(trades.filter(trade => draftTradeIds.includes(trade.id)).map(trade => trade.name))
    const [drawerTop, setDrawerTop] = useState(0)
    const rangeMinimum = priceRange?.minimum ?? 0
    const rangeMaximum = priceRange?.maximum ?? 0
    // Empty means "from the range's edge": filled in when the range arrives.
    const [minimumInput, setMinimumInput] = useState(filters.minimumPrice === null ? '' : String(filters.minimumPrice))
    const [maximumInput, setMaximumInput] = useState(filters.maximumPrice === null ? '' : String(filters.maximumPrice))

    useEffect(() => {
        let active = true
        setPriceRange(undefined)
        getPriceRange(draftTradeIds, query)
            .then(range => {
                if (!active) return
                setPriceRange(range)
                setMinimumInput(current => current === '' && range ? String(range.minimum) : current)
                setMaximumInput(current => current === '' && range ? String(range.maximum) : current)
            })
            .catch(() => { if (active) setPriceRange(null) })
        return () => { active = false }
    }, [draftTradeIds, query])
    const normalizedMinimum = Math.min(rangeMaximum, Math.max(rangeMinimum, Number(minimumInput) || rangeMinimum))
    const normalizedMaximum = Math.min(rangeMaximum, Math.max(rangeMinimum, Number(maximumInput) || rangeMaximum))
    const selectedMinimum = Math.min(normalizedMinimum, normalizedMaximum)
    const selectedMaximum = Math.max(normalizedMinimum, normalizedMaximum)

    useLayoutEffect(() => {
        const element = dialog.current!
        const previousOverflow = document.body.style.overflow
        const updateDrawerTop = () => {
            const heroBottom = document.querySelector<HTMLElement>('.hero')?.getBoundingClientRect().bottom ?? 0
            setDrawerTop(Math.max(0, heroBottom))
        }
        updateDrawerTop()
        element.showModal()
        document.body.style.overflow = 'hidden'
        window.addEventListener('resize', updateDrawerTop)
        return () => {
            window.removeEventListener('resize', updateDrawerTop)
            element.close()
            document.body.style.overflow = previousOverflow
        }
    }, [])

    function applyFilters() {
        onApply({
            ...draft,
            location: draft.location.trim(),
            // Without the range yet (or at all) the prices go as they are: one already chosen is kept.
            minimumPrice: !priceRange ? (minimumInput === '' ? null : Number(minimumInput)) : selectedMinimum === rangeMinimum ? null : selectedMinimum,
            maximumPrice: !priceRange ? (maximumInput === '' ? null : Number(maximumInput)) : selectedMaximum === rangeMaximum ? null : selectedMaximum,
        }, draftTradeIds)
    }

    /** Other trades have another price range: the price goes back to the whole of the new one. */
    function chooseTrades(nextTradeIds: number[]) {
        setDraftTradeIds(nextTradeIds)
        setMinimumInput('')
        setMaximumInput('')
    }

    function clearFilters() {
        setDraft(emptyProfessionalFilters)
        setCalendarOpen(false)
        setMinimumInput(String(rangeMinimum))
        setMaximumInput(String(rangeMaximum))
    }

    function normalizePriceInputs() {
        setMinimumInput(String(selectedMinimum))
        setMaximumInput(String(selectedMaximum))
    }

    return createPortal(
        <dialog ref={dialog} className="filter-panel" style={{ '--drawer-top': `${drawerTop}px` } as CSSProperties} aria-labelledby="filter-panel-title" onCancel={event => { event.preventDefault(); onClose() }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
            <form className="filter-panel__form" onSubmit={event => { event.preventDefault(); applyFilters() }}>
                <div className="filter-panel__header">
                    <div>
                        <span>Profesionales</span>
                        <h2 id="filter-panel-title">Filtrar resultados</h2>
                    </div>
                    <button type="button" className="filter-panel__close" aria-label="Cerrar filtros" onClick={onClose}>×</button>
                </div>

                <div className="filter-panel__body">
                    <section className="filter-group">
                        <div className="filter-group__heading"><Icon name="location" /><div><h3>Ubicación y distancia</h3><p>Ajustá la zona donde necesitás el servicio.</p></div></div>
                        <div className="location-controls">
                            <label className="filter-field">
                                <span>Ciudad o barrio</span>
                                {/* Typed by hand, the point chosen before no longer matches the text */}
                                <input value={draft.location} onChange={event => setDraft(current => ({ ...current, location: event.target.value, point: null, maxDistanceKm: null }))} placeholder="Ej. Montevideo" />
                            </label>
                            <label className={`filter-field${draft.point ? '' : ' filter-field--disabled'}`}>
                                <span>Radio</span>
                                <select disabled={!draft.point} value={draft.maxDistanceKm ?? ''} onChange={event => setDraft(current => ({ ...current, maxDistanceKm: event.target.value ? Number(event.target.value) : null }))}>
                                    <option value="">Cualquier distancia</option>
                                    {MAX_DISTANCES_KM.map(km => <option key={km} value={km}>A menos de {km} km</option>)}
                                </select>
                            </label>
                        </div>
                        <ZonePicker query={draft.location} onChoose={(location, point) => setDraft(current => ({ ...current, location, point }))} locateSaved savedPoint={draft.point} radiusKm={draft.maxDistanceKm ?? undefined} mapLabel="Mapa para elegir la zona donde necesitás el servicio" />
                        {!draft.point && <small className="filter-note">Elegí el lugar en el mapa o en la lista para ver quién llega hasta ahí.</small>}
                    </section>

                    <section className="filter-group">
                        <div className="filter-group__heading"><Icon name="wrench" /><div><h3>Rubros</h3><p>Podés elegir varios rubros a la vez.</p></div></div>
                        {trades.length === 0 ? <p className="filter-empty">No hay rubros disponibles.</p> : (
                            <div className="trade-options" role="group" aria-label="Rubros">
                                <button type="button" className={draftTradeIds.length === 0 ? 'active' : ''} aria-pressed={draftTradeIds.length === 0} onClick={() => chooseTrades([])}>Todos los rubros</button>
                                {trades.map(trade => <button key={trade.id} type="button" className={draftTradeIds.includes(trade.id) ? 'active' : ''} aria-pressed={draftTradeIds.includes(trade.id)} onClick={() => chooseTrades(toggleTrade(draftTradeIds, trade.id))}>{trade.name}</button>)}
                            </div>
                        )}
                    </section>

                    <section className="filter-group">
                        <div className="filter-group__heading"><Icon name="money" /><div><h3>{tradeName ? `Precio para ${tradeName}` : 'Precio por hora'}</h3><p>Rango de precio por hora.</p></div></div>
                        {priceRange ? <>
                            <div className="price-selection"><span>Rango seleccionado</span><strong>{formatPrice(selectedMinimum)} – {formatPrice(selectedMaximum)}</strong></div>
                            <div className="price-inputs">
                                <label><span>Mínimo</span><div><span aria-hidden="true">$</span><input aria-label="Ingresar precio mínimo" type="number" min={rangeMinimum} max={rangeMaximum} step="1" value={minimumInput} onChange={event => setMinimumInput(event.target.value)} onBlur={normalizePriceInputs} /></div></label>
                                <label><span>Máximo</span><div><span aria-hidden="true">$</span><input aria-label="Ingresar precio máximo" type="number" min={rangeMinimum} max={rangeMaximum} step="1" value={maximumInput} onChange={event => setMaximumInput(event.target.value)} onBlur={normalizePriceInputs} /></div></label>
                            </div>
                            <div className="price-slider" style={{ '--range-start': `${((selectedMinimum - rangeMinimum) / Math.max(rangeMaximum - rangeMinimum, 1)) * 100}%`, '--range-end': `${((selectedMaximum - rangeMinimum) / Math.max(rangeMaximum - rangeMinimum, 1)) * 100}%` } as CSSProperties}>
                                <input aria-label="Precio mínimo" type="range" min={rangeMinimum} max={rangeMaximum} step="1" value={selectedMinimum} onChange={event => setMinimumInput(String(Math.min(Number(event.target.value), selectedMaximum)))} />
                                <input aria-label="Precio máximo" type="range" min={rangeMinimum} max={rangeMaximum} step="1" value={selectedMaximum} onChange={event => setMaximumInput(String(Math.max(Number(event.target.value), selectedMinimum)))} />
                            </div>
                            <div className="price-available"><span>{formatPrice(rangeMinimum)}</span><span>{formatPrice(rangeMaximum)}</span></div>
                        </> : priceRange === undefined ? <output className="filter-empty">Cargando precios…</output>
                            : <p className="filter-empty">No hay precios disponibles para este rubro.</p>}
                    </section>

                    <section className="filter-group">
                        <div className="filter-group__heading"><Icon name="calendar" /><div><h3>Disponibilidad</h3><p>Elegí cuándo necesitás el servicio.</p></div></div>
                        <div className="rating-options" role="group" aria-label="Cuándo">
                            <button type="button" className={draft.availability === null ? 'active' : ''} aria-pressed={draft.availability === null} onClick={() => chooseAvailability(null)}>Sin preferencia</button>
                            {presets.map(({ label, range }) => {
                                const chosen = draft.availability?.from === range.from && draft.availability.to === range.to
                                return <button key={label} type="button" className={chosen ? 'active' : ''} aria-pressed={chosen} onClick={() => chooseAvailability(range)}>{label}</button>
                            })}
                            <button type="button" className={`availability-custom${customChosen || calendarOpen ? ' active' : ''}`} aria-expanded={calendarOpen} aria-controls="availability-calendar" onClick={() => setCalendarOpen(open => !open)}>
                                {customChosen && !calendarOpen && draft.availability ? `Personalizar: ${rangeLabel(draft.availability, now)}` : 'Personalizar'}
                            </button>
                        </div>
                        {calendarOpen && (
                            <div id="availability-calendar" className="availability-menu">
                                <DateRangeCalendar value={draft.availability} min={today} max={lastDay} onChange={availability => setDraft(current => ({ ...current, availability }))} />
                                <button type="button" className="availability-menu__done" onClick={() => setCalendarOpen(false)}>Listo</button>
                            </div>
                        )}
                    </section>

                    <section className="filter-group">
                        <div className="filter-group__heading"><Icon name="star" /><div><h3>Calificación mínima</h3><p>Elegí la valoración mínima de los perfiles.</p></div></div>
                        <div className="rating-options" role="group" aria-label="Calificación mínima">
                            {[null, 4, 4.5, 5].map(value => <button key={value ?? 'all'} type="button" className={draft.minimumRating === value ? 'active' : ''} aria-pressed={draft.minimumRating === value} onClick={() => setDraft({ ...draft, minimumRating: value })}>{value === null ? 'Cualquiera' : value === 5 ? '5★' : `${value}★ o más`}</button>)}
                        </div>
                    </section>
                </div>

                <div className="filter-panel__actions">
                    <button type="button" className="filter-panel__clear" onClick={clearFilters}>Limpiar filtros</button>
                    <Button type="submit">Aplicar filtros</Button>
                </div>
            </form>
        </dialog>,
        document.body,
    )
}
