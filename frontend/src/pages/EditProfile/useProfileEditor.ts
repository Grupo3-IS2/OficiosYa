import { useRef, useState } from 'react'
import { getCurrentUser, getRegistrationProfile, isAuthenticated, logout, updateStoredUser } from '../../services/authService'
import { updateUser } from '../../services/userService'
import { personalChanged, professionalChanged, readLocalProfile, securityChanged, validateSecurity, writeLocalProfile } from './profileState'
import type { PersonalData, ProfessionalData, ProfileSection, SecurityData } from './profileState'

export default function useProfileEditor(professionalOverride?: boolean) {
    const [user] = useState(getCurrentUser)
    const [isProfessional] = useState(() => professionalOverride ?? (getRegistrationProfile()?.accountType === 'professional'))
    const account = user?.email ?? 'demo'
    const [savedPersonal, setSavedPersonal] = useState<PersonalData>(() => {
        const local = readLocalProfile(account).personal
        return {
            name: user?.name ?? local?.name ?? 'Martín Rodríguez',
            email: user?.email ?? local?.email ?? 'martin.rodriguez@email.com',
            phone: local?.phone ?? (user ? '' : '+598 99 123 456'),
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
    const [busy, setBusy] = useState(false)
    const saving = useRef(false)
    const [error, setError] = useState('')
    const [messages, setMessages] = useState<Partial<Record<ProfileSection, string>>>({})
    const dirty = {
        personal: personalChanged(personal, savedPersonal),
        security: securityChanged(security),
        professional: isProfessional && professionalChanged(professional, savedProfessional),
    }

    async function save(sections: ProfileSection[]): Promise<boolean> {
        if (saving.current) return false
        setError('')
        // Validate every pending section before doing any writes.
        if (sections.includes('security') && dirty.security) {
            setError(validateSecurity(security) || 'El cambio de contraseña aún no está disponible. Cancela para conservar lo escrito o descarta los cambios para salir.')
            return false
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
        }
        saving.current = true
        setBusy(true)
        try {
            if (sections.includes('professional') && dirty.professional) {
                writeLocalProfile(user ? savedPersonal.email : account, 'professional', professional)
                setSavedProfessional(professional)
                setMessages(previous => ({ ...previous, professional: 'Perfil guardado temporalmente en esta pestaña. Todavía no se sincroniza con tu cuenta.' }))
            }
            if (sections.includes('personal') && dirty.personal) {
                let saved = { ...personal, name: personal.name.trim(), email: personal.email.trim() }
                let emailChanged = false
                if (user) {
                    if (saved.name !== savedPersonal.name || saved.email !== savedPersonal.email) {
                        if (!isAuthenticated()) throw new Error('Inicia sesión nuevamente antes de guardar tus datos personales.')
                        const response = await updateUser(savedPersonal.email, { name: saved.name, email: saved.email })
                        saved = { ...saved, name: response.name, email: response.email }
                        updateStoredUser({ name: response.name, email: response.email })
                        emailChanged = response.email !== savedPersonal.email
                        // Preserve server success even if local storage subsequently fails.
                        setSavedPersonal(previous => ({ ...previous, name: response.name, email: response.email }))
                    }
                }
                try {
                    writeLocalProfile(user ? saved.email : account, 'personal', saved)
                    if (emailChanged && isProfessional) writeLocalProfile(saved.email, 'professional', sections.includes('professional') ? professional : savedProfessional)
                    setPersonal(saved)
                    setSavedPersonal(saved)
                    setMessages(previous => ({ ...previous, personal: emailChanged
                        ? 'Datos guardados. Inicia sesión con tu nuevo correo. Foto y teléfono guardados temporalmente en esta pestaña.'
                        : user ? 'Datos guardados. Foto y teléfono guardados temporalmente en esta pestaña.'
                            : 'Vista de prueba: datos guardados temporalmente en esta pestaña.' }))
                } finally {
                    if (emailChanged) logout()
                }
            }
            return true
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudieron guardar los cambios. Inténtalo nuevamente.')
            return false
        } finally {
            saving.current = false
            setBusy(false)
        }
    }

    return {
        user, isProfessional, personal, setPersonal, professional, setProfessional, security, setSecurity,
        busy, error, messages, dirty, hasChanges: Object.values(dirty).some(Boolean),
        saveSection: (section: ProfileSection) => save([section]),
        savePending: () => save((Object.keys(dirty) as ProfileSection[]).filter(section => dirty[section])),
        clearError: () => setError(''),
        discard: () => {
            setPersonal(savedPersonal)
            setProfessional(savedProfessional)
            setSecurity({ current: '', password: '', confirmation: '' })
            setError('')
        },
    }
}
