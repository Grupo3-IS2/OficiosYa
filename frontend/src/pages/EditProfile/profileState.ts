export interface PersonalData {
    name: string
    email: string
    phone: string
    avatar: string
}

export interface SecurityData {
    current: string
    password: string
    confirmation: string
}

export interface ProfessionalData {
    description: string
    zones: string[]
    accepting: boolean
}

export type ProfileSection = 'personal' | 'security' | 'professional'

export function personalChanged(current: PersonalData, saved: PersonalData) {
    return current.name !== saved.name || current.email !== saved.email
        || current.phone !== saved.phone || current.avatar !== saved.avatar
}

export function professionalChanged(current: ProfessionalData, saved: ProfessionalData) {
    return current.description !== saved.description || current.accepting !== saved.accepting
        || current.zones.length !== saved.zones.length
        || current.zones.some(zone => !saved.zones.includes(zone))
}

export function securityChanged(value: SecurityData) {
    return Boolean(value.current || value.password || value.confirmation)
}

export function validateSecurity(value: SecurityData): string {
    if (!value.current || !value.password || !value.confirmation) return 'Completa los tres campos de contraseña.'
    if (value.password.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.'
    if (!/[A-Z]/.test(value.password)) return 'La nueva contraseña debe incluir al menos una mayúscula.'
    if (!/[a-z]/.test(value.password)) return 'La nueva contraseña debe incluir al menos una minúscula.'
    if (!/\d/.test(value.password)) return 'La nueva contraseña debe incluir al menos un número.'
    if (!/[^A-Za-z0-9]/.test(value.password)) return 'La nueva contraseña debe incluir al menos un carácter especial.'
    if (value.password !== value.confirmation) return 'Las contraseñas nuevas no coinciden.'
    if (value.password === value.current) return 'La nueva contraseña debe ser diferente de la actual.'
    return ''
}

// Temporary frontend persistence. Passwords must never be included here.
export function readLocalProfile(account: string): { personal?: PersonalData; professional?: ProfessionalData } {
    try {
        const value = JSON.parse(sessionStorage.getItem(`oficiosya_edit_profile:${account}`) ?? '{}')
        const personal = value?.personal
        const professional = value?.professional
        return {
            personal: personal && ['name', 'email', 'phone', 'avatar'].every(key => typeof personal[key] === 'string')
                ? personal : undefined,
            professional: professional && typeof professional.description === 'string'
                && typeof professional.accepting === 'boolean' && Array.isArray(professional.zones)
                && professional.zones.every((zone: unknown) => typeof zone === 'string') ? professional : undefined,
        }
    } catch { return {} }
}

export function writeLocalProfile(account: string, section: 'personal', value: PersonalData): void
export function writeLocalProfile(account: string, section: 'professional', value: ProfessionalData): void
export function writeLocalProfile(account: string, section: 'personal' | 'professional', value: PersonalData | ProfessionalData) {
    try {
        sessionStorage.setItem(`oficiosya_edit_profile:${account}`, JSON.stringify({ ...readLocalProfile(account), [section]: value }))
    } catch {
        throw new Error('No se pudieron guardar los datos temporales en este navegador. Prueba con una foto más pequeña o habilita el almacenamiento local.')
    }
}
