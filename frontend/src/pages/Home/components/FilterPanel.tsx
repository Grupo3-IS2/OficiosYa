import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import type { PriceRange, ProfessionalFilters } from '../professionalFilters'
import { emptyProfessionalFilters } from '../professionalFilters'
import './FilterPanel.css'

interface Props {
    filters: ProfessionalFilters
    priceRange: PriceRange | null
    tradeName?: string
    onApply: (filters: ProfessionalFilters) => void
    onClose: () => void
}

const formatPrice = (price: number) => `$${price.toLocaleString('es-UY')}`

export default function FilterPanel({ filters, priceRange, tradeName, onApply, onClose }: Props) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [draft, setDraft] = useState(filters)
    const [drawerTop, setDrawerTop] = useState(0)
    const rangeMinimum = priceRange?.minimum ?? 0
    const rangeMaximum = priceRange?.maximum ?? 0
    const [minimumInput, setMinimumInput] = useState(String(filters.minimumPrice ?? rangeMinimum))
    const [maximumInput, setMaximumInput] = useState(String(filters.maximumPrice ?? rangeMaximum))
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
            minimumPrice: selectedMinimum === rangeMinimum ? null : selectedMinimum,
            maximumPrice: selectedMaximum === rangeMaximum ? null : selectedMaximum,
        })
    }

    function clearFilters() {
        setDraft(emptyProfessionalFilters)
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
                                <input value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} placeholder="Ej. Montevideo" />
                            </label>
                            <label className="filter-field filter-field--disabled">
                                <span>Radio</span>
                                <select disabled><option>Cualquier distancia</option></select>
                            </label>
                        </div>
                        <small className="filter-note">La búsqueda por kilómetros estará disponible próximamente.</small>
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
                            <div className="price-available"><span>{formatPrice(rangeMinimum)}</span><small>Rango total disponible</small><span>{formatPrice(rangeMaximum)}</span></div>
                        </> : <p className="filter-empty">No hay precios disponibles para este rubro.</p>}
                    </section>

                    <section className="filter-group">
                        <div className="filter-group__heading"><Icon name="calendar" /><div><h3>Disponibilidad</h3><p>Elegí cuándo necesitás el servicio.</p></div></div>
                        <label className="filter-field filter-field--disabled">
                            <span>Cuándo</span>
                            <select disabled><option>Sin preferencia</option><option>Disponible hoy</option><option>Disponible mañana</option><option>Esta semana</option></select>
                        </label>
                        <small className="filter-note">La agenda de profesionales estará disponible próximamente.</small>
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
