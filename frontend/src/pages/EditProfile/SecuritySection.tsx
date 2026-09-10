import { useState } from 'react'
import Button from '../../components/Button/Button'
import Icon from '../../components/Icon/Icon'
import type { SecurityData } from './profileState'

function PasswordField({ id, label, value, onChange, current = false }: {
    id: string; label: string; value: string; onChange: (value: string) => void; current?: boolean
}) {
    const [visible, setVisible] = useState(false)
    return <div className="profile-field">
        <label htmlFor={id}>{label}</label>
        <div className="profile-password">
            <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} required minLength={current ? undefined : 8} autoComplete={current ? 'current-password' : 'new-password'} aria-describedby={id === 'new-password' ? 'password-help' : undefined} />
            <button type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eye-off' : 'eye'} /></button>
        </div>
        {id === 'new-password' && <small id="password-help">Usa al menos 8 caracteres, con mayúscula, minúscula, número y símbolo.</small>}
    </div>
}

export default function SecuritySection({ value, onChange, onSave, message, error }: {
    value: SecurityData; onChange: (value: SecurityData) => void; onSave: () => Promise<boolean>; message?: string; error?: string
}) {
    const { current, password, confirmation } = value
    const setCurrent = (current: string) => onChange({ ...value, current })
    const setPassword = (password: string) => onChange({ ...value, password })
    const setConfirmation = (confirmation: string) => onChange({ ...value, confirmation })
    return <section className="profile-section" aria-labelledby="security-title">
        <h2 id="security-title">Seguridad</h2>
        <p className="profile-subtitle">Mantén tu cuenta segura con una contraseña resistente.</p>
        <form onSubmit={event => { event.preventDefault(); void onSave() }}>
            <PasswordField id="current-password" label="Contraseña actual" value={current} onChange={setCurrent} current />
            <div className="profile-password-grid">
                <PasswordField id="new-password" label="Nueva contraseña" value={password} onChange={setPassword} />
                <PasswordField id="confirm-password" label="Confirmar nueva contraseña" value={confirmation} onChange={setConfirmation} />
            </div>
            <div className="profile-actions"><Button type="submit">Actualizar contraseña</Button></div>
            {error && <p className="profile-error" role="alert">{error}</p>}
            {message && <p className="profile-feedback" role="status">{message}</p>}
        </form>
    </section>
}
