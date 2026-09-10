import { useState } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import type { ProfessionalData } from './profileState'

const availableZones = ['Montevideo', 'Ciudad de la Costa', 'Las Piedras', 'Pando', 'La Paz', 'Canelones', 'Maldonado', 'Punta del Este']

export default function ProfessionalProfileSection({ value, onChange, onSave, message }: {
    value: ProfessionalData; onChange: (value: ProfessionalData) => void; onSave: () => Promise<boolean>; message?: string
}) {
    const { description, zones, accepting } = value
    const setDescription = (description: string) => onChange({ ...value, description })
    const setZones = (zones: string[]) => onChange({ ...value, zones })
    const setAccepting = (accepting: boolean) => onChange({ ...value, accepting })
    const [search, setSearch] = useState('')
    const [open, setOpen] = useState(false)
    const [panelMessage, setPanelMessage] = useState('')
    const matches = availableZones.filter(zone => !zones.includes(zone) && zone.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))

    function addZone(zone: string) {
        setZones([...zones, zone]); setSearch(''); setOpen(false)
    }

    return <section className="profile-section professional-section" aria-labelledby="professional-title">
        <div className="professional-heading">
            <div><h2 id="professional-title">Perfil profesional</h2><p className="profile-subtitle">Cuéntanos sobre tu experiencia y las zonas donde trabajas.</p></div>
            <button className="profile-text-link" type="button" onClick={() => setPanelMessage('El panel profesional estará disponible próximamente.')}>Ir al panel profesional →</button>
        </div>
        <form onSubmit={event => { event.preventDefault(); void onSave() }}>
            <div className="profile-field">
                <label htmlFor="profile-description">Descripción general</label>
                <small id="description-help">Cuenta brevemente tu experiencia, especialidades y forma de trabajo.</small>
                <div className="profile-description">
                    <textarea id="profile-description" maxLength={300} value={description} onChange={event => setDescription(event.target.value)} aria-describedby="description-help description-count" />
                    <small id="description-count">{description.length} / 300</small>
                </div>
            </div>
            <div className="profile-field zone-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
                <label htmlFor="profile-zone-search">Zonas de cobertura</label>
                <div className="profile-zone-search">
                    <Icon name="search" />
                    <input id="profile-zone-search" placeholder="Buscar y agregar zonas" value={search} onFocus={() => setOpen(true)} onChange={event => { setSearch(event.target.value); setOpen(true) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (open && matches.length) addZone(matches[0]) } }} aria-expanded={open} aria-controls="profile-zone-options" />
                    <button type="button" aria-label={open ? 'Cerrar zonas' : 'Mostrar zonas'} aria-expanded={open} onClick={() => setOpen(!open)}>⌄</button>
                </div>
                {open && <div id="profile-zone-options" className="profile-zone-options" aria-label="Zonas disponibles">{matches.length ? matches.map(zone => <button type="button" key={zone} onClick={() => addZone(zone)}>{zone}</button>) : <p>No hay zonas disponibles para esta búsqueda.</p>}</div>}
                <div className="profile-zone-chips">{zones.map(zone => <span key={zone}>{zone}<button type="button" aria-label={`Eliminar ${zone}`} onClick={() => setZones(zones.filter(selected => selected !== zone))}>×</button></span>)}</div>
            </div>
            <label className="profile-availability">
                <input type="checkbox" role="switch" checked={accepting} onChange={event => setAccepting(event.target.checked)} />
                <span>Aceptar nuevas solicitudes<small>Si lo desactivas, dejarás de recibir nuevas solicitudes temporalmente.</small></span>
            </label>
            <div className="profile-actions"><Button type="submit">Guardar cambios</Button></div>
            {message && <p className="profile-feedback" role="status">{message}</p>}
            {panelMessage && <p className="profile-feedback" role="status">{panelMessage}</p>}
        </form>
    </section>
}
