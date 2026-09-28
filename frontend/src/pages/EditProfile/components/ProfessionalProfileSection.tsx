import { useState } from 'react'
import Button from '../../../components/Button/Button'
import ZonePicker from '../../../components/ZonePicker/ZonePicker'
import type { Trade } from '../../../types/Professional'
import type { ProfessionalData, ProfessionalTradeData } from '../profileState'

export default function ProfessionalProfileSection({ value, onChange, onSave, message, error, trades, tradesLoading, tradesError }: Readonly<{
    value: ProfessionalData; onChange: (value: ProfessionalData) => void; onSave: () => Promise<boolean>
    message?: string; error?: string; trades: Trade[]; tradesLoading: boolean; tradesError: string
}>) {
    const { description, workingLocation, published } = value
    const setDescription = (description: string) => onChange({ ...value, description })
    const setWorkingLocation = (workingLocation: string) => onChange({ ...value, workingLocation })
    const [selectedTradeId, setSelectedTradeId] = useState('')
    const availableTrades = trades.filter(trade => !value.trades.some(selected => selected.tradeId === trade.id))

    function addTrade() {
        const trade = availableTrades.find(item => item.id === Number(selectedTradeId))
        if (!trade) return
        onChange({ ...value, trades: [...value.trades, { id: null, tradeId: trade.id, tradeName: trade.name, minimumHourlyWage: '', maximumHourlyWage: '' }] })
        setSelectedTradeId('')
    }

    function updateTrade(tradeId: number, changes: Partial<ProfessionalTradeData>) {
        onChange({ ...value, trades: value.trades.map(trade => trade.tradeId === tradeId ? { ...trade, ...changes } : trade) })
    }

    return <section className="profile-section professional-section" aria-labelledby="professional-title">
        <div className="professional-heading">
            <div><h2 id="professional-title">Perfil profesional</h2><p className="profile-subtitle">Cuéntanos sobre tu experiencia y dónde trabajas.</p></div>
        </div>
        <form onSubmit={event => { event.preventDefault(); void onSave() }}>
            <div className="profile-field">
                <label htmlFor="profile-description">Descripción general</label>
                <small id="description-help">Cuenta brevemente tu experiencia, especialidades y forma de trabajo.</small>
                <div className="profile-description">
                    <textarea id="profile-description" maxLength={500} value={description} onChange={event => setDescription(event.target.value)} aria-describedby="description-help description-count" />
                    <small id="description-count">{description.length} / 500</small>
                </div>
            </div>
            <div className="profile-field">
                <label htmlFor="profile-working-location">Ubicación de trabajo</label>
                <input id="profile-working-location" value={workingLocation} onChange={event => setWorkingLocation(event.target.value)} />
                <ZonePicker query={workingLocation} onChoose={setWorkingLocation} locateSaved />
            </div>
            <div className="profile-field">
                <label htmlFor="profile-trade-select">Oficios que realizás</label>
                <small>Elegí los oficios de tu perfil y la tarifa por hora para cada uno.</small>
                <div className="profile-trade-picker">
                    <select id="profile-trade-select" value={selectedTradeId} onChange={event => setSelectedTradeId(event.target.value)} disabled={tradesLoading || Boolean(tradesError) || availableTrades.length === 0}>
                        <option value="">{tradesLoading ? 'Cargando oficios...' : 'Seleccioná un oficio'}</option>
                        {availableTrades.map(trade => <option key={trade.id} value={trade.id}>{trade.name}</option>)}
                    </select>
                    <Button type="button" onClick={addTrade} disabled={!selectedTradeId}>Agregar</Button>
                </div>
                {tradesError && <p className="profile-error" role="alert">{tradesError}</p>}
                {value.trades.map(trade => <div className="profile-trade" key={trade.tradeId}>
                    <div className="profile-trade-heading">
                        <strong>{trade.tradeName}</strong>
                        <button type="button" onClick={() => onChange({ ...value, trades: value.trades.filter(item => item.tradeId !== trade.tradeId) })}>Quitar</button>
                    </div>
                    <div className="profile-trade-prices">
                        <label>Tarifa mínima por hora<input type="number" min="0" step="0.01" value={trade.minimumHourlyWage} onChange={event => updateTrade(trade.tradeId, { minimumHourlyWage: event.target.value })} /></label>
                        <label>Tarifa máxima por hora<input type="number" min="0" step="0.01" value={trade.maximumHourlyWage} onChange={event => updateTrade(trade.tradeId, { maximumHourlyWage: event.target.value })} /></label>
                    </div>
                </div>)}
            </div>
            <label className="profile-availability">
                <input type="checkbox" role="switch" checked={published} onChange={event => onChange({ ...value, published: event.target.checked })} />
                <span>Ofrecer mis servicios<small>Al guardar, tu perfil aparecerá en el inicio si completaste la descripción, ubicación y al menos un oficio.</small></span>
            </label>
            <div className="profile-actions"><Button type="submit">Guardar cambios</Button></div>
            {error && <p className="profile-error" role="alert">{error}</p>}
            {message && <output className="profile-feedback">{message}</output>}
        </form>
    </section>
}
