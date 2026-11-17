import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import BackNavigation from '../../components/BackNavigation/BackNavigation'
import Button from '../../components/Button/Button'
import Header from '../../components/Header/Header'
import PhoneField from '../../components/PhoneField/PhoneField'
import RadiusField, { DEFAULT_RADIUS_KM } from '../../components/RadiusField/RadiusField'
import ZonePicker from '../../components/ZonePicker/ZonePicker'
import { useSession } from '../../components/SessionProvider/useSession'
import { becomeProfessional } from '../../services/userService'
import type { ServiceArea } from '../../types/Professional'
import { getCurrentUser, updateStoredUser } from '../../services/authService'
import professionalIllustration from '../../assets/become-professional.png'
import '../EditProfile/EditProfile.css'
import './BecomeProfessionalPage.css'

/** A client activates their professional profile, then completes it on the edit-profile page. */
export default function BecomeProfessionalPage() {
    const { user } = useSession()
    const alreadyProfessional = user?.role === 'PROFESSIONAL'
    const [phoneNumber, setPhoneNumber] = useState('')
    const [workingLocation, setWorkingLocation] = useState('')
    const [serviceArea, setServiceArea] = useState<ServiceArea | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (alreadyProfessional) window.location.replace('/profile/edit')
    }, [alreadyProfessional])

    async function submit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
            const professional = await becomeProfessional(phoneNumber, workingLocation.trim(), serviceArea)
            const stored = getCurrentUser()
            if (stored) updateStoredUser({ ...stored, role: professional.role })
            // The edit page loads the professional sections from the profile it fetches
            window.location.href = '/profile/edit'
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No pudimos activar tu perfil profesional. Intentá nuevamente.')
            setBusy(false)
        }
    }

    if (alreadyProfessional) return null

    return <div className="become-professional-page">
        <Header />
        <main className="become-professional-page__content">
            <BackNavigation onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/' }}>Volver</BackNavigation>
            <section className="profile-section become-professional" aria-labelledby="become-professional-title">
                <img src={professionalIllustration} alt="" width="145" height="145" />
                <h1 id="become-professional-title">Convertite en profesional</h1>
                <p>Dejanos un teléfono y dónde trabajás. Después vas a poder completar tu perfil, agregar tus oficios y publicarlo.</p>
                <form className="become-professional__form" onSubmit={event => { void submit(event) }}>
                    <div className="profile-field">
                        <label htmlFor="become-professional-phone">Número de teléfono</label>
                        <div className="profile-phone"><PhoneField id="become-professional-phone" value={phoneNumber} onChange={setPhoneNumber} required /></div>
                    </div>
                    <div className="profile-field">
                        <label htmlFor="become-professional-location">Ubicación de trabajo</label>
                        <input id="become-professional-location" value={workingLocation} required placeholder="Ej. Cordón, Montevideo"
                            onChange={event => { setWorkingLocation(event.target.value); setServiceArea(null) }} />
                        <ZonePicker query={workingLocation} radiusKm={serviceArea?.radiusKm} onChoose={(label, point) => {
                            setWorkingLocation(label)
                            setServiceArea({ latitude: point.lat, longitude: point.lon, radiusKm: serviceArea?.radiusKm ?? DEFAULT_RADIUS_KM })
                        }} />
                        {serviceArea
                            ? <RadiusField id="become-professional-radius" value={serviceArea.radiusKm} onChange={radiusKm => setServiceArea({ ...serviceArea, radiusKm })} />
                            : <small role="status">Marcá en el mapa hasta dónde llegás para aparecer en las búsquedas por cercanía: elegí una sugerencia o tocá el mapa.</small>}
                    </div>
                    {error && <p className="profile-error" role="alert">{error}</p>}
                    <Button type="submit" disabled={busy}>{busy ? 'Activando…' : 'Activar perfil profesional'}</Button>
                </form>
                <small>También podrás seguir contratando servicios.</small>
            </section>
        </main>
    </div>
}
