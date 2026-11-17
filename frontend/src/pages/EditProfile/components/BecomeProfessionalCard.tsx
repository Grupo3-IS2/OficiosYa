import { useState } from 'react'
import type { SubmitEvent } from 'react'
import Button from '../../../components/Button/Button'
import PhoneField from '../../../components/PhoneField/PhoneField'
import { becomeProfessional } from '../../../services/userService'
import { getCurrentUser, updateStoredUser } from '../../../services/authService'
import professionalIllustration from '../../../assets/become-professional.png'

export default function BecomeProfessionalCard() {
    const [open, setOpen] = useState(false)
    const [phoneNumber, setPhoneNumber] = useState('')
    const [workingLocation, setWorkingLocation] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function submit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
            const professional = await becomeProfessional(phoneNumber, workingLocation.trim())
            const user = getCurrentUser()
            if (user) updateStoredUser({ ...user, role: professional.role })
            // The page loads the professional sections from the profile it fetches, so start over with it
            window.location.reload()
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No pudimos activar tu perfil profesional. Intentá nuevamente.')
            setBusy(false)
        }
    }

    return <section className="profile-section become-professional" aria-labelledby="become-professional-title">
        <img src={professionalIllustration} alt="" width="145" height="145" />
        <h2 id="become-professional-title">¿Quieres ofrecer tus servicios en OficiosYa?</h2>
        <p>Activa tu perfil profesional para crear publicaciones y comenzar a recibir solicitudes de clientes.</p>
        {open
            ? <form className="become-professional__form" onSubmit={event => { void submit(event) }}>
                <div className="profile-field">
                    <label htmlFor="become-professional-phone">Número de teléfono</label>
                    <div className="profile-phone"><PhoneField id="become-professional-phone" value={phoneNumber} onChange={setPhoneNumber} required /></div>
                </div>
                <div className="profile-field">
                    <label htmlFor="become-professional-location">Ubicación</label>
                    <input id="become-professional-location" value={workingLocation} required placeholder="Ej. Cordón, Montevideo"
                        onChange={event => setWorkingLocation(event.target.value)} />
                </div>
                {error && <p className="profile-error" role="alert">{error}</p>}
                <Button type="submit" disabled={busy}>{busy ? 'Activando…' : 'Activar perfil profesional'}</Button>
            </form>
            : <Button type="button" onClick={() => setOpen(true)}>Quiero ofrecer mis servicios</Button>}
        <small>También podrás seguir contratando servicios.</small>
    </section>
}
