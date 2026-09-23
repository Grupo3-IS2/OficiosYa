import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon/Icon'
import type { ProfessionalOrder } from '../professionalOrder'

const options: { value: ProfessionalOrder; label: string; disabled?: boolean }[] = [
    { value: 'relevance', label: 'Relevancia' },
    { value: 'distance', label: 'Más cercanos', disabled: true },
    { value: 'price-asc', label: 'Menor precio' },
    { value: 'price-desc', label: 'Mayor precio' },
    { value: 'rating-desc', label: 'Mejor calificación' },
]

export default function SortControl({ value, onChange }: { value: ProfessionalOrder; onChange: (value: ProfessionalOrder) => void }) {
    const [open, setOpen] = useState(false)
    const container = useRef<HTMLDivElement>(null)
    const selected = options.find(option => option.value === value) ?? options[0]

    useEffect(() => {
        if (!open) return
        function close(event: MouseEvent) {
            if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
        }
        function closeWithEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', close)
        document.addEventListener('keydown', closeWithEscape)
        return () => {
            document.removeEventListener('mousedown', close)
            document.removeEventListener('keydown', closeWithEscape)
        }
    }, [open])

    return <div className="sort-control" ref={container}>
        <button type="button" className="sort-control__trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
            <span>Ordenar por: <strong>{selected.label}</strong></span><Icon name="chevron-down" />
        </button>
        {open && <div className="sort-control__menu" role="listbox" aria-label="Ordenar profesionales">
            {options.map(option => <button key={option.value} type="button" role="option" aria-selected={value === option.value} disabled={option.disabled} title={option.disabled ? 'Disponible próximamente' : undefined} onClick={() => { onChange(option.value); setOpen(false) }}>
                <span>{option.label}</span>{value === option.value && <span aria-hidden="true">✓</span>}
            </button>)}
        </div>}
    </div>
}
