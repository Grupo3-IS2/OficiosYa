import { useRef, useState } from 'react'
import { getCurrentUser, getRegistrationProfile, isAuthenticated, logout, updateStoredUser } from '../../services/authService'
import { changeEmail, changePassword } from '../../services/userService'
import { ApiError } from '../../services/api'
import { personalChanged, professionalChanged, readLocalProfile, securityChanged, validateSecurity, writeLocalProfile } from './profileState'
import type { PersonalData, ProfessionalData, ProfileSection, SecurityData } from './profileState'

export default function useProfileEditor(professionalOverride?: boolean) {
    const [user] = useState(getCurrentUser)
    const [registrationProfile] = useState(getRegistrationProfile)
    const [isProfessional] = useState(() => professionalOverride ?? (registrationProfile?.accountType === 'professional'))
    const account = user?.email ?? 'demo'
    const [savedPersonal, setSavedPersonal] = useState<PersonalData>(() => {
        const local = readLocalProfile(account).personal
        return {
            name: user?.name ?? local?.name ?? 'Martín Rodríguez',
            email: user?.email ?? local?.email ?? 'martin.rodriguez@email.com',
            phone: local?.phone ?? registrationProfile?.phoneNumber ?? (user ? '' : '+598 99 123 456'),
            avatar: local?.avatar ?? '',
        }
    })
    const [personal, setPersonal] = useState(savedPersonal)
    const [savedProfessional, setSavedProfessional] = useState<ProfessionalData>(() => readLocalProfile(account).professional ?? {
        description: 'Electricista con experiencia en instalaciones y mantenimiento eléctrico. Trabajo con compromiso, puntualidad y atención a cada detalle, ofreciendo soluciones seguras y de calidad.',
        zones: ['Montevideo', 'Ciudad de la Costa'],
        accepting: true,
    })
    const [professional, setProfessional] = useState(savedProfessional)
    const [security, setSecurity] = useState<SecurityData>({ current: '', password: '', confirmation: '' })
    const [emailPassword, setEmailPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const saving = useRef(false)
    const [error, setError] = useState('')
    const [errorSection, setErrorSection] = useState<ProfileSection | ''>('')
    const [messages, setMessages] = useState<Partial<Record<ProfileSection, string>>>({})
    const dirty = {
        personal: personalChanged(personal, savedPersonal),
        security: securityChanged(security),
        professional: isProfessional && professionalChanged(professional, savedProfessional),
    }

    async function save(sections: ProfileSection[]): Promise<boolean> {
        if (saving.current) return false
        setError('')
        setErrorSection(sections.length === 1 ? sections[0] : '')
        // Validate every pending section before doing any writes.
        if (sections.includes('security') && dirty.security) {
            const validationError = validateSecurity(security)
            if (validationError) {
                setError(validationError)
                return false
            }
        }
        if (sections.includes('personal')) {
            const emailInput = document.createElement('input')
            emailInput.type = 'email'
            emailInput.required = true
            emailInput.value = personal.email.trim()
            if (!personal.name.trim() || !emailInput.checkValidity()) {
                setError('Revisa los datos personales: ingresa un nombre y un correo válido.')
                return false
            }
            if (user && personal.email.trim() !== savedPersonal.email && !emailPassword) {
                setError('Ingresa tu contraseña actual para cambiar el correo.')
                return false
            }
        }
        saving.current = true
        setBusy(true)
        try {
            if (sections.includes('security') && dirty.security) {
                if (!isAuthenticated()) throw new Error('Inicia sesión nuevamente antes de cambiar tu contraseña.')
                await changePassword({
                    oldPassword: security.current,
                    newPassword: security.password,
                    newPasswordConfirmation: security.confirmation,
                })
                setSecurity({ current: '', password: '', confirmation: '' })
                setMessages(previous => ({ ...previous, security: 'Contraseña actualizada correctamente.' }))
            }
            if (sections.includes('professional') && dirty.professional) {
                writeLocalProfile(user ? savedPersonal.email : account, 'professional', professional)
                setSavedProfessional(professional)
                setMessages(previous => ({ ...previous, professional: 'Perfil guardado temporalmente en esta pestaña. Todavía no se sincroniza con tu cuenta.' }))
            }
            if (sections.includes('personal') && dirty.personal) {
                let saved = { ...personal, name: personal.name.trim(), email: personal.email.trim() }
                let emailChanged = false
                if (user) {
                    if (saved.email !== savedPersonal.email) {
                        if (!isAuthenticated()) throw new Error('Inicia sesión nuevamente antes de guardar tus datos personales.')
                        const response = await changeEmail({ newEmail: saved.email, currentPassword: emailPassword })
                        saved = { ...saved, email: response.email }
                        updateStoredUser({ name: saved.name, email: response.email })
                        emailChanged = response.email !== savedPersonal.email
                        // Preserve server success even if local storage subsequently fails.
                        setSavedPersonal(previous => ({ ...previous, name: response.name, email: response.email }))
                    }
                }
                writeLocalProfile(user ? saved.email : account, 'personal', saved)
                    if (emailChanged && isProfessional) writeLocalProfile(saved.email, 'professional', sections.includes('professional') ? professional : savedProfessional)
                    setPersonal(saved)
                    setSavedPersonal(saved)
                    setEmailPassword('')
                    setMessages(previous => ({ ...previous, personal: emailChanged
                        ? 'Correo y datos actualizados. Foto y teléfono guardados temporalmente en esta pestaña.'
                        : user ? 'Datos guardados. Foto y teléfono guardados temporalmente en esta pestaña.'
                            : 'Vista de prueba: datos guardados temporalmente en esta pestaña.' }))
            }
            setErrorSection('')
            return true
        } catch (reason) {
            if (reason instanceof ApiError && reason.status === 401) {
                logout()
                setError('Tu sesión venció. Inicia sesión nuevamente antes de guardar los cambios.')
            } else {
                setError(reason instanceof Error ? reason.message : 'No se pudieron guardar los cambios. Inténtalo nuevamente.')
            }
            return false
        } finally {
            saving.current = false
            setBusy(false)
        }
    }

    return {
        user, isProfessional, personal, setPersonal, savedPersonalEmail: savedPersonal.email, emailPassword, setEmailPassword, professional, setProfessional, security, setSecurity,
        busy, error, errorSection, messages, dirty, hasChanges: Object.values(dirty).some(Boolean),
        saveSection: (section: ProfileSection) => save([section]),
        savePending: () => save((Object.keys(dirty) as ProfileSection[]).filter(section => dirty[section])),
        clearError: () => { setError(''); setErrorSection('') },
        discard: () => {
            setPersonal(savedPersonal)
            setProfessional(savedProfessional)
            setSecurity({ current: '', password: '', confirmation: '' })
            setEmailPassword('')
            setError('')
            setErrorSection('')
        },
    }
}
