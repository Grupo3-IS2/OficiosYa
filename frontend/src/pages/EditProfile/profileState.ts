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
    workingLocation: string
    trades: ProfessionalTradeData[]
    published: boolean
}

export interface ProfessionalTradeData {
    id: number | null
    tradeId: number
    tradeName: string
    minimumHourlyWage: string
    maximumHourlyWage: string
}

export type ProfileSection = 'personal' | 'security' | 'professional'

export function personalChanged(current: PersonalData, saved: PersonalData) {
    return current.name !== saved.name || current.email !== saved.email
        || current.phone !== saved.phone || current.avatar !== saved.avatar
}

export function professionalChanged(current: ProfessionalData, saved: ProfessionalData) {
    return current.description !== saved.description || current.workingLocation !== saved.workingLocation
        || current.published !== saved.published
        || current.trades.length !== saved.trades.length
        || current.trades.some(trade => {
            const original = saved.trades.find(item => item.tradeId === trade.tradeId)
            return !original || trade.minimumHourlyWage !== original.minimumHourlyWage
                || trade.maximumHourlyWage !== original.maximumHourlyWage
        })
}

export function validateProfessional(current: ProfessionalData, saved: ProfessionalData): string {
    const description = current.description.trim()
    if (description !== saved.description && (description.length < 20 || description.length > 500)) {
        return 'La descripción debe tener entre 20 y 500 caracteres.'
    }
    if (!current.workingLocation.trim()) return 'Ingresá una ubicación de trabajo.'
    if (current.published && (description.length < 20 || current.trades.length === 0)) {
        return 'Para ofrecer tus servicios, completá la descripción y elegí al menos un oficio.'
    }
    for (const trade of current.trades) {
        const minimum = Number(trade.minimumHourlyWage)
        const maximum = Number(trade.maximumHourlyWage)
        if (!trade.minimumHourlyWage.trim() || !trade.maximumHourlyWage.trim()
            || !Number.isFinite(minimum) || !Number.isFinite(maximum)
            || minimum < 0 || maximum < minimum) {
            return `Ingresá tarifas válidas para ${trade.tradeName}: la máxima debe ser mayor o igual a la mínima.`
        }
    }
    return ''
}

export function securityChanged(value: SecurityData) {
    return Boolean(value.current || value.password || value.confirmation)
}

// La misma regla que PhoneNumberValidator en el backend, que un profesional tiene que cumplir.
const PHONE_FORMAT = /^(\+\d{1,3})?\d{9}$/

export function validatePhone(phone: string): string {
    const value = phone.trim()
    if (!value) return 'Ingresa tu número de teléfono.'
    if (!PHONE_FORMAT.test(value)) return 'Ingresa un teléfono válido: 9 dígitos, con prefijo internacional opcional.'
    return ''
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
