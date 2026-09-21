import { useEffect, useRef, useState } from 'react'
import { getCurrentUser, getRegistrationProfile, isAuthenticated, updateStoredUser } from '../../services/authService'
import { changeEmail, changePassword, getAuthenticatedUser, isProfessionalResponse, updateClient, updateProfessional, uploadProfileImage } from '../../services/userService'
import { ApiError } from '../../services/api'
import { personalChanged, professionalChanged, readLocalProfile, securityChanged, validatePhone, validateSecurity, writeLocalProfile } from './profileState'
import type { PersonalData, ProfessionalData, ProfileSection, SecurityData } from './profileState'

export default function useProfileEditor(professionalOverride?: boolean) {
    const [user] = useState(getCurrentUser)
    const [registrationProfile] = useState(getRegistrationProfile)
    const [isProfessional, setIsProfessional] = useState(() => professionalOverride ?? (user?.role === 'PROFESSIONAL' || registrationProfile?.accountType === 'professional'))
    const account = user?.email ?? 'demo'
    // Sesiones abiertas antes de que se guardara el publicId lo recuperan de /user/me.
    const [userId, setUserId] = useState(() => user?.id ?? '')
    const [savedPersonal, setSavedPersonal] = useState<PersonalData>(() => {
        const local = readLocalProfile(account).personal
        return {
            name: user?.name ?? local?.name ?? '',
            email: user?.email ?? local?.email ?? '',
            phone: local?.phone ?? registrationProfile?.phoneNumber ?? '',
            avatar: local?.avatar ?? '',
        }
    })
    const [personal, setPersonal] = useState(savedPersonal)
    const [savedProfessional, setSavedProfessional] = useState<ProfessionalData>(() => readLocalProfile(account).professional ?? {
        description: '',
        zones: [],
        accepting: true,
    })
    const [professional, setProfessional] = useState(savedProfessional)
    const [security, setSecurity] = useState<SecurityData>({ current: '', password: '', confirmation: '' })
    const [emailPassword, setEmailPassword] = useState('')
    // The selected photo is only uploaded when the personal section is saved.
    const [photo, setPhoto] = useState<File | null>(null)
    const photoPreview = useRef('')
    const [busy, setBusy] = useState(false)
    const saving = useRef(false)
    const [error, setError] = useState('')
    const [errorSection, setErrorSection] = useState<ProfileSection | ''>('')
    const [messages, setMessages] = useState<Partial<Record<ProfileSection, string>>>({})

    useEffect(() => {
        if (!user || professionalOverride !== undefined) return
        let active = true
        void getAuthenticatedUser().then(response => {
            if (!active) return
            const avatar = response.profileImageUrl ?? ''
            // Sólo el profesional tiene teléfono en el servidor; el del cliente sigue siendo local.
            const phone = isProfessionalResponse(response) ? response.phoneNumber : null
            setIsProfessional(response.role === 'PROFESSIONAL')
            setUserId(response.id)
            updateStoredUser({ id: response.id, name: response.name, email: response.email, role: response.role })
            setSavedPersonal(previous => ({ ...previous, name: response.name, email: response.email, phone: phone ?? previous.phone, avatar }))
            setPersonal(previous => ({ ...previous, name: response.name, email: response.email, phone: phone ?? previous.phone, avatar: photoPreview.current ? previous.avatar : avatar }))
        }).catch(() => undefined)
        return () => { active = false }
    }, [professionalOverride, user])

    useEffect(() => () => {
        if (photoPreview.current) URL.revokeObjectURL(photoPreview.current)
    }, [])

    function releasePhotoPreview() {
        if (photoPreview.current) URL.revokeObjectURL(photoPreview.current)
        photoPreview.current = ''
    }

    function selectPhoto(file: File) {
        releasePhotoPreview()
        const preview = URL.createObjectURL(file)
        photoPreview.current = preview
        setPhoto(file)
        setPersonal(previous => ({ ...previous, avatar: preview }))
    }

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
            if (isProfessional) {
                const phoneError = validatePhone(personal.phone)
                if (phoneError) {
                    setError(phoneError)
                    return false
                }
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
                let saved = { ...personal, name: personal.name.trim(), email: personal.email.trim(), phone: personal.phone.trim() }
                let emailChanged = false
                if (user) {
                    if (photo) {
                        if (!isAuthenticated()) throw new Error('Inicia sesión nuevamente antes de guardar tus datos personales.')
                        const response = await uploadProfileImage(photo)
                        const avatar = response.profileImageUrl ?? ''
                        saved = { ...saved, avatar }
                        // Preserve the uploaded photo even if a later step of this save fails.
                        setSavedPersonal(previous => ({ ...previous, avatar }))
                        setPersonal(previous => ({ ...previous, avatar }))
                        setPhoto(null)
                        releasePhotoPreview()
                    }
                    // Los datos propios del rol se guardan en su endpoint; el correo tiene el suyo.
                    const nameChanged = saved.name !== savedPersonal.name
                    const phoneChanged = isProfessional && saved.phone !== savedPersonal.phone
                    if (nameChanged || phoneChanged) {
                        if (!isAuthenticated()) throw new Error('Inicia sesión nuevamente antes de guardar tus datos personales.')
                        if (!userId) throw new Error('No pudimos identificar tu cuenta. Vuelve a iniciar sesión.')
                        const response = isProfessional
                            ? await updateProfessional(userId, {
                                ...(nameChanged && { name: saved.name }),
                                ...(phoneChanged && { phoneNumber: saved.phone }),
                            })
                            : await updateClient(userId, { name: saved.name })
                        // El servidor manda: ignora un teléfono en blanco, así que devuelve el vigente.
                        const phone = isProfessionalResponse(response) ? response.phoneNumber : saved.phone
                        saved = { ...saved, name: response.name, phone }
                        updateStoredUser({ id: userId, name: response.name, email: savedPersonal.email, role: response.role })
                        // Preserve server success even if a later step of this save fails.
                        setSavedPersonal(previous => ({ ...previous, name: response.name, phone }))
                        setPersonal(previous => ({ ...previous, name: response.name, phone }))
                    }
                    if (saved.email !== savedPersonal.email) {
                        if (!isAuthenticated()) throw new Error('Inicia sesión nuevamente antes de guardar tus datos personales.')
                        const response = await changeEmail({ newEmail: saved.email, currentPassword: emailPassword })
                        saved = { ...saved, email: response.email }
                        updateStoredUser({ id: userId, name: saved.name, email: response.email, role: response.role })
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
                        ? 'Correo y datos actualizados.'
                        : user ? 'Datos guardados.'
                            : 'Vista de prueba: datos guardados temporalmente en esta pestaña.' }))
            }
            setErrorSection('')
            return true
        } catch (reason) {
            // A 401 never lands here as a visible error: apiRequest already sends the user to log in.
            if (!(reason instanceof ApiError && reason.status === 401)) {
                setError(reason instanceof Error ? reason.message : 'No se pudieron guardar los cambios. Inténtalo nuevamente.')
            }
            return false
        } finally {
            saving.current = false
            setBusy(false)
        }
    }

    return {
        user, isProfessional, personal, setPersonal, selectPhoto, savedPersonalEmail: savedPersonal.email, emailPassword, setEmailPassword, professional, setProfessional, security, setSecurity,
        busy, error, errorSection, messages, dirty, hasChanges: Object.values(dirty).some(Boolean),
        saveSection: (section: ProfileSection) => save([section]),
        savePending: () => save((Object.keys(dirty) as ProfileSection[]).filter(section => dirty[section])),
        clearError: () => { setError(''); setErrorSection('') },
        discard: () => {
            setPersonal(savedPersonal)
            setProfessional(savedProfessional)
            setSecurity({ current: '', password: '', confirmation: '' })
            setEmailPassword('')
            setPhoto(null)
            releasePhotoPreview()
            setError('')
            setErrorSection('')
        },
    }
}
