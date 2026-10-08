import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon/Icon'
import type { RequestOrder } from './requestList'

const options: { value: RequestOrder; label: string }[] = [
    { value: 'newest', label: 'Más recientes' },
    { value: 'oldest', label: 'Más antiguas' },
]

interface RequestOrderControlProps {
    value: RequestOrder
    onChange: (value: RequestOrder) => void
}

export default function RequestOrderControl({ value, onChange }: RequestOrderControlProps) {
    const [open, setOpen] = useState(false)
    const container = useRef<HTMLDivElement>(null)
    const selected = options.find(option => option.value === value) ?? options[0]

    useEffect(() => {
        if (!open) return

        function closeOutside(event: MouseEvent) {
            if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
        }

        function closeWithEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false)
        }

        document.addEventListener('mousedown', closeOutside)
        document.addEventListener('keydown', closeWithEscape)
        return () => {
            document.removeEventListener('mousedown', closeOutside)
            document.removeEventListener('keydown', closeWithEscape)
        }
    }, [open])

    return <div className="requests-order" ref={container}>
        <button
            type="button"
            className="requests-order__trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen(current => !current)}
        >
            <span>Ordenar por: <strong>{selected.label}</strong></span>
            <Icon name="chevron-down" />
        </button>
        {open && <div className="requests-order__menu" role="listbox" aria-label="Ordenar solicitudes">
            {options.map(option => <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                }}
            >{option.label}</button>)}
        </div>}
    </div>
}
