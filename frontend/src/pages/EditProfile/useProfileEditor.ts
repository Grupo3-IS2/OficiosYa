import { useEffect, useRef, useState } from 'react'
import { getCurrentUser, isAuthenticated, updateStoredUser } from '../../services/authService'
import { addExpertiseTrade, changePassword, getAuthenticatedUser, getTrades, isProfessionalResponse, removeExpertiseTrade, resendEmailChangeCode, setProfessionalPublished, startEmailChange, updateClient, updateExpertiseTrade, updateProfessional, uploadProfileImage, verifyEmailChange } from '../../services/userService'
import type { ProfessionalResponse } from '../../services/userService'
import { ApiError } from '../../services/api'
import { personalChanged, professionalChanged, securityChanged, validatePhone, validateProfessional, validateSecurity } from './profileState'
import type { PersonalData, ProfessionalData, ProfileSection, SecurityData } from './profileState'
import type { PendingVerification } from '../../types/Auth'
import type { Trade } from '../../types/Professional'
import type { AccountAccess } from './components/GoogleAccountSection'

function professionalDataFrom(response: ProfessionalResponse): ProfessionalData {
    return {
        description: response.description ?? '',
        workingLocation: response.workingLocation ?? '',
        published: response.published,
        trades: response.expertiseTrades.map(trade => ({
            id: trade.id,
            tradeId: trade.tradeId,
            tradeName: trade.tradeName,
            minimumHourlyWage: String(trade.minimumHourlyWage),
            maximumHourlyWage: String(trade.maximumHourlyWage),
        })),
    }
}

export default function useProfileEditor(professionalOverride?: boolean) {
    const [user, setUser] = useState(getCurrentUser)
    const [isProfessional, setIsProfessional] = useState(() => professionalOverride ?? user?.role === 'PROFESSIONAL')
    const [loadingProfile, setLoadingProfile] = useState(professionalOverride === undefined)
    const [profileLoadFailed, setProfileLoadFailed] = useState(false)
    const [savedPersonal, setSavedPersonal] = useState<PersonalData>(() => {
        return {
            name: user?.name ?? '',
            email: user?.email ?? '',
            phone: '',
            avatar: '',
        }
    })
    const [personal, setPersonal] = useState(savedPersonal)
    const [savedProfessional, setSavedProfessional] = useState<ProfessionalData>({
        description: '',
        workingLocation: '',
        trades: [],
        published: false,
    })
    const [professional, setProfessional] = useState(savedProfessional)
    const [trades, setTrades] = useState<Trade[]>([])
    const [tradesError, setTradesError] = useState('')
    const [tradesLoading, setTradesLoading] = useState(true)
    const [security, setSecurity] = useState<SecurityData>({ current: '', password: '', confirmation: '' })
    const [emailPassword, setEmailPassword] = useState('')
    // A change of email that was started: a code is on its way to the new address and the account
    // keeps its current email until that code is entered.
    const [emailChange, setEmailChange] = useState<PendingVerification | null>(null)
    // Whether the account has a password and a linked Google: what the security section offers depends on it.
    const [access, setAccess] = useState<AccountAccess>({ hasPassword: true, googleLinked: false })
    // The selected photo is only uploaded when the personal section is saved.
    const [photo, setPhoto] = useState<File | null>(null)
    const photoPreview = useRef('')
    const [busy, setBusy] = useState(false)
    const saving = useRef(false)
    const [error, setError] = useState('')
    const [errorSection, setErrorSection] = useState<ProfileSection | ''>('')
    const [messages, setMessages] = useState<Partial<Record<ProfileSection, string>>>({})

    useEffect(() => {
        try {
            for (let index = sessionStorage.length - 1; index >= 0; index--) {
                const key = sessionStorage.key(index)
                if (key?.startsWith('oficiosya_edit_profile:')) sessionStorage.removeItem(key)
            }
        } catch { /* El editor ya no depende del almacenamiento del navegador. */ }
    }, [])

    useEffect(() => {
        if (professionalOverride !== undefined) return
        let active = true
        void getAuthenticatedUser().then(response => {
            if (!active) return
            const avatar = response.profileImageUrl ?? ''
            // Sólo el profesional tiene teléfono en el servidor; el del cliente sigue siendo local.
            const phone = isProfessionalResponse(response) ? response.phoneNumber : null
            setIsProfessional(response.role === 'PROFESSIONAL')
            setAccess({ hasPassword: response.hasPassword ?? true, googleLinked: response.googleLinked ?? false })
            setUser({ id: response.id, name: response.name, email: response.email, role: response.role })
            updateStoredUser({ id: response.id, name: response.name, email: response.email, role: response.role })
            setSavedPersonal(previous => ({ ...previous, name: response.name, email: response.email, phone: phone ?? previous.phone, avatar }))
            setPersonal(previous => ({ ...previous, name: response.name, email: response.email, phone: phone ?? previous.phone, avatar: photoPreview.current ? previous.avatar : avatar }))
            if (isProfessionalResponse(response)) {
                const professionalData = professionalDataFrom(response)
                setSavedProfessional(professionalData)
                setProfessional(professionalData)
            }
        }).catch(() => {
            if (active) {
                setProfileLoadFailed(true)
                setError('No pudimos cargar tu perfil. Intentá nuevamente más tarde.')
            }
        }).finally(() => {
            if (active) setLoadingProfile(false)
        })
        return () => { active = false }
    }, [professionalOverride])

    useEffect(() => {
        if (!isProfessional) return
        let active = true
        void getTrades().then(response => {
            if (active) setTrades(response)
        }).catch(() => {
            if (active) setTradesError('No pudimos cargar los oficios disponibles.')
        }).finally(() => {
            if (active) setTradesLoading(false)
        })
        return () => { active = false }
    }, [isProfessional])

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
        // A started email change is already with the server: leaving the page just abandons it, so it
        // doesn't count as an unsaved change (what else was typed still does).
        personal: personalChanged(personal, emailChange ? { ...savedPersonal, email: personal.email } : savedPersonal),
        security: securityChanged(security),
        professional: isProfessional && professionalChanged(professional, savedProfessional),
    }

    function changeProfessional(value: ProfessionalData) {
        setProfessional(value)
        setMessages(previous => ({ ...previous, professional: '' }))
        if (errorSection === 'professional') setError('')
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
            if (user && !emailChange && personal.email.trim() !== savedPersonal.email && !emailPassword) {
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
        if (sections.includes('professional') && dirty.professional) {
            const validationError = validateProfessional(professional, savedProfessional)
            if (validationError) {
                setError(validationError)
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
                if (!isAuthenticated()) throw new Error('Inicia sesión nuevamente antes de guardar tu perfil profesional.')
                let persisted = savedProfessional
                const record = (response: ProfessionalResponse) => {
                    persisted = professionalDataFrom(response)
                    setSavedProfessional(persisted)
                }
                const tradesChanged = professional.trades.length !== persisted.trades.length
                    || professional.trades.some(trade => {
                        const original = persisted.trades.find(item => item.tradeId === trade.tradeId)
                        return !original || original.minimumHourlyWage !== trade.minimumHourlyWage
                            || original.maximumHourlyWage !== trade.maximumHourlyWage
                    })
                if (persisted.published && (!professional.published || tradesChanged)) {
                    record(await setProfessionalPublished(false))
                }
                if (professional.description.trim() !== persisted.description || professional.workingLocation.trim() !== persisted.workingLocation) {
                    record(await updateProfessional({
                        ...(professional.description.trim() !== persisted.description && { description: professional.description.trim() }),
                        ...(professional.workingLocation.trim() !== persisted.workingLocation && { workingLocation: professional.workingLocation.trim() }),
                    }))
                }
                for (const trade of professional.trades.filter(item => !persisted.trades.some(saved => saved.tradeId === item.tradeId))) {
                    record(await addExpertiseTrade(trade.tradeId, Number(trade.minimumHourlyWage), Number(trade.maximumHourlyWage)))
                }
                for (const trade of persisted.trades.filter(item => !professional.trades.some(selected => selected.tradeId === item.tradeId))) {
                    if (trade.id !== null) record(await removeExpertiseTrade(trade.id))
                }
                for (const trade of professional.trades) {
                    const original = persisted.trades.find(item => item.tradeId === trade.tradeId)
                    if (original && original.id !== null && (trade.minimumHourlyWage !== original.minimumHourlyWage || trade.maximumHourlyWage !== original.maximumHourlyWage)) {
                        record(await updateExpertiseTrade(original.id, Number(trade.minimumHourlyWage), Number(trade.maximumHourlyWage)))
                    }
                }
                if (professional.published && !persisted.published) {
                    record(await setProfessionalPublished(true))
                }
                setProfessional(persisted)
                setMessages(previous => ({ ...previous, professional: 'Perfil profesional actualizado.' }))
            }
            if (sections.includes('personal') && dirty.personal) {
                let emailStarted = false
                let saved = { ...personal, name: personal.name.trim(), email: personal.email.trim(), phone: personal.phone.trim() }
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
                        const response = isProfessional
                            ? await updateProfessional({
                                ...(nameChanged && { name: saved.name }),
                                ...(phoneChanged && { phoneNumber: saved.phone }),
                            })
                            : await updateClient({ name: saved.name })
                        // El servidor manda: ignora un teléfono en blanco, así que devuelve el vigente.
                        const phone = isProfessionalResponse(response) ? response.phoneNumber : saved.phone
                        saved = { ...saved, name: response.name, phone }
                        updateStoredUser({ id: response.id, name: response.name, email: savedPersonal.email, role: response.role })
                        // Preserve server success even if a later step of this save fails.
                        setSavedPersonal(previous => ({ ...previous, name: response.name, phone }))
                        setPersonal(previous => ({ ...previous, name: response.name, phone }))
                    }
                    // The email doesn't change here: this mails a code to the new address, and it
                    // changes when the code is entered (confirmEmailChange). Once started, saving the
                    // rest of the section doesn't start it again.
                    if (!emailChange && saved.email !== savedPersonal.email) {
                        if (!isAuthenticated()) throw new Error('Inicia sesión nuevamente antes de guardar tus datos personales.')
                        setEmailChange(await startEmailChange({ newEmail: saved.email, currentPassword: emailPassword }))
                        emailStarted = true
                    }
                }
                // The saved email stays the current one while a change waits for its code.
                setPersonal(saved)
                setSavedPersonal(emailStarted || emailChange ? { ...saved, email: savedPersonal.email } : saved)
                setEmailPassword('')
                setMessages(previous => ({
                    ...previous,
                    personal: emailStarted
                        ? 'Datos guardados. Te enviamos un código al nuevo correo para confirmar el cambio.'
                        : 'Datos guardados.',
                }))
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

    /** Enters the code that reached the new address: the email changes. Throws the message to show if it doesn't. */
    async function confirmEmailChange(code: string): Promise<void> {
        if (!emailChange) return
        const response = await verifyEmailChange(emailChange.email, code)
        setUser({ id: response.id, name: response.name, email: response.email, role: response.role })
        updateStoredUser({ id: response.id, name: response.name, email: response.email, role: response.role })
        setSavedPersonal(previous => ({ ...previous, email: response.email }))
        setPersonal(previous => ({ ...previous, email: response.email }))
        setEmailChange(null)
        setMessages(previous => ({ ...previous, personal: 'Correo actualizado.' }))
    }

    async function resendEmailChange(): Promise<PendingVerification> {
        if (!emailChange) throw new Error('No hay un cambio de correo en curso.')
        const renewed = await resendEmailChangeCode(emailChange.email)
        setEmailChange(renewed)
        return renewed
    }

    /** Gives up the change: the code on its way is simply never used, and the field goes back to the current email. */
    function cancelEmailChange() {
        setEmailChange(null)
        setPersonal(previous => ({ ...previous, email: savedPersonal.email }))
        setEmailPassword('')
    }

    return {
        emailChange, confirmEmailChange, resendEmailChange, cancelEmailChange,
        user, isProfessional, personal, setPersonal, selectPhoto, savedPersonalEmail: savedPersonal.email, emailPassword, setEmailPassword, access, setAccess, professional, setProfessional: changeProfessional, trades, tradesError, tradesLoading, security, setSecurity,
        busy, loadingProfile, profileLoadFailed, error, errorSection, messages, dirty, hasChanges: Object.values(dirty).some(Boolean),
        saveSection: (section: ProfileSection) => save([section]),
        savePending: () => save((Object.keys(dirty) as ProfileSection[]).filter(section => dirty[section])),
        clearError: () => { setError(''); setErrorSection('') },
        discard: () => {
            setPersonal(savedPersonal)
            setProfessional(savedProfessional)
            setSecurity({ current: '', password: '', confirmation: '' })
            setEmailPassword('')
            setEmailChange(null)
            setPhoto(null)
            releasePhotoPreview()
            setError('')
            setErrorSection('')
        },
    }
}
