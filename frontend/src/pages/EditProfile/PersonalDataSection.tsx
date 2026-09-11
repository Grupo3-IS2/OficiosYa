import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import Button from '../../components/Button/Button'
import avatarPlaceholder from '../../assets/avatar-placeholder.svg'
import type { PersonalData } from './profileState'

export default function PersonalDataSection({ value, onChange, onSave, message, error, emailChanged, currentPassword, onCurrentPasswordChange }: {
    value: PersonalData; onChange: Dispatch<SetStateAction<PersonalData>>; onSave: () => Promise<boolean>; message?: string; error?: string
    emailChanged: boolean; currentPassword: string; onCurrentPasswordChange: (password: string) => void
}) {
    const { name, email, phone, avatar } = value
    const setName = (name: string) => onChange(previous => ({ ...previous, name }))
    const setEmail = (email: string) => onChange(previous => ({ ...previous, email }))
    const setPhone = (phone: string) => onChange(previous => ({ ...previous, phone }))
    const [photoError, setPhotoError] = useState('')
    const fileInput = useRef<HTMLInputElement>(null)
    const photoRead = useRef(0)

    return (
        <section className="profile-section" aria-labelledby="personal-title">
            <h2 id="personal-title">Datos personales</h2>
            <p className="profile-subtitle">Actualiza tus datos de contacto.</p>
            <form onSubmit={event => { event.preventDefault(); void onSave() }} className="personal-layout">
                <div className="profile-photo">
                    <img src={avatar || avatarPlaceholder} alt="Foto de perfil" />
                    <input ref={fileInput} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (!file) return
                        if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                            setPhotoError('Elige un JPG o PNG de hasta 5 MB.'); return
                        }
                        const read = ++photoRead.current
                        const reader = new FileReader()
                        reader.onload = () => {
                            if (read !== photoRead.current) return
                            setPhotoError('')
                            onChange(previous => ({ ...previous, avatar: String(reader.result) }))
                        }
                        reader.onerror = () => setPhotoError('No se pudo leer la foto. Intenta con otro archivo.')
                        reader.readAsDataURL(file)
                    }} />
                    <Button type="button" variant="ghost" onClick={() => fileInput.current?.click()}>Cambiar foto</Button>
                    <small>JPG o PNG. Máx. 5 MB.</small>
                    {photoError && <p className="profile-error" role="alert">{photoError}</p>}
                </div>
                <div className="personal-fields">
                    <div className="profile-field"><label htmlFor="profile-name">Nombre</label><input id="profile-name" autoComplete="name" required value={name} onChange={event => setName(event.target.value)} /></div>
                    <div className="profile-field"><label htmlFor="profile-email">Correo electrónico</label><input id="profile-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} aria-describedby="email-help" /><small id="email-help">Si cambias tu correo, tendrás que verificarlo.</small></div>
                    {emailChanged && <div className="profile-field"><label htmlFor="profile-email-password">Contraseña actual</label><input id="profile-email-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => onCurrentPasswordChange(event.target.value)} aria-describedby="email-password-help" /><small id="email-password-help">Necesaria para confirmar el cambio de correo.</small></div>}
                    {phone != "" && <div className="profile-field"><label htmlFor="profile-phone">Número de teléfono</label><input id="profile-phone" type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} /></div>}
                    <div className="profile-actions"><Button type="submit">Guardar cambios</Button></div>
                    {error && <p className="profile-error" role="alert">{error}</p>}
                    {message && <p className="profile-feedback" role="status">{message}</p>}
                </div>
            </form>
        </section>
    )
}
