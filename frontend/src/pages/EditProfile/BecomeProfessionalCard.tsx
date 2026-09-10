import { useState } from 'react'
import Button from '../../components/Button/Button'
import professionalIllustration from '../../assets/become-professional.png'

export default function BecomeProfessionalCard() {
    const [message, setMessage] = useState('')
    return <section className="profile-section become-professional" aria-labelledby="become-professional-title">
        <img src={professionalIllustration} alt="" width="145" height="145" />
        <h2 id="become-professional-title">¿Quieres ofrecer tus servicios en OficiosYa?</h2>
        <p>Activa tu perfil profesional para crear publicaciones y comenzar a recibir solicitudes de clientes.</p>
        <Button type="button" onClick={() => setMessage('Próximamente podrás activar tu perfil profesional desde aquí.')}>Quiero ofrecer mis servicios</Button>
        <small>También podrás seguir contratando servicios.</small>
        {message && <p className="profile-feedback" role="status">{message}</p>}
    </section>
}
