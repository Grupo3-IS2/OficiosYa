import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import Button from '../../../components/Button/Button'
import avatarPlaceholder from '../../../assets/avatar-placeholder.svg'
import type { PendingVerification } from '../../../types/Auth'
import type { PersonalData } from '../profileState'
import EmailChangeModal from './EmailChangeModal'
import PhoneField from '../../../components/PhoneField/PhoneField'

export default function PersonalDataSection({ value, onChange, onPhotoChange, onPhotoRemove, onSave, message, error, showPhone, emailEditable = true, onStartEmailChange, onConfirmEmailChange, showNotifications }: {
    value: PersonalData; onChange: Dispatch<SetStateAction<PersonalData>>; onPhotoChange: (file: File) => void; onPhotoRemove: () => void; onSave: () => Promise<boolean>; message?: string; error?: string
    showPhone: boolean
    /** False for an account created with Google: its email can't be changed from here. */
    emailEditable?: boolean
    onStartEmailChange: (newEmail: string, currentPassword: string) => Promise<PendingVerification>
    onConfirmEmailChange: (newEmail: string, code: string) => Promise<void>
    /** False until the profile says how the switch is. */
    showNotifications: boolean
}) {
    const { name, email, phone, avatar, emailNotifications } = value
    const setPhone = (phone: string) => onChange(previous => ({ ...previous, phone }))
    const [photoError, setPhotoError] = useState('')
    const [changingEmail, setChangingEmail] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)

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
                        setPhotoError('')
                        onPhotoChange(file)
                    }} />
                    <Button type="button" variant="ghost" onClick={() => fileInput.current?.click()}>Cambiar foto</Button>
                    {avatar && <button type="button" className="profile-photo__remove" onClick={() => { setPhotoError(''); onPhotoRemove() }}>Quitar foto</button>}
                    <small>JPG o PNG. Máx. 5 MB.</small>
                    {photoError && <p className="profile-error" role="alert">{photoError}</p>}
                </div>
                <div className="personal-fields">
                    <div className="profile-field"><label htmlFor="profile-name">Nombre</label><input id="profile-name" autoComplete="name" value={name} disabled /></div>
                    <div className="profile-field">
                        <label htmlFor="profile-email">Correo electrónico</label>
                        <div className="mailed-code">
                            <input id="profile-email" type="email" value={email} disabled aria-describedby="email-help" />
                            {emailEditable && <Button type="button" variant="ghost" onClick={() => setChangingEmail(true)}>Cambiar correo</Button>}
                        </div>
                    </div>
                    {showPhone && <div className="profile-field"><label htmlFor="profile-phone">Número de teléfono</label><div className="profile-phone"><PhoneField id="profile-phone" value={phone} onChange={setPhone} /></div></div>}
                    {showNotifications && <div className="profile-field">
                        <label className="profile-availability">
                            <input type="checkbox" role="switch" checked={emailNotifications} onChange={event => onChange(previous => ({ ...previous, emailNotifications: event.target.checked }))} />
                            <span>
                                Recibir avisos por correo
                                <small>Te escribimos sólo cuando algo de tus solicitudes necesita tu respuesta: cuando te piden cambiar el horario de un trabajo, y cuando se te juntan varias solicitudes sin responder.</small>
                            </span>
                        </label>
                    </div>}
                    <div className="profile-actions"><Button type="submit">Guardar cambios</Button></div>
                    {error && <p className="profile-error" role="alert">{error}</p>}
                    {message && <output className="profile-feedback">{message}</output>}
                </div>
            </form>
            {changingEmail && <EmailChangeModal currentEmail={email} onStart={onStartEmailChange} onConfirm={onConfirmEmailChange} onClose={() => setChangingEmail(false)} />}
        </section>
    )
}
