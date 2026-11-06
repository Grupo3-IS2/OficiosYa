/**
 * Banks a professional can be paid into, with their logo in public/banks/ and the account format the interbank
 * payments system (SPI) asks for: https://www.brou.com.uy/personas/servicios/spi
 */
export const URUGUAYAN_BANKS = [
    { name: 'BROU', logo: '/banks/brou.png', hint: '14 dígitos: los 9 de la cuenta y los 5 de la subcuenta.', placeholder: '001234567-00001' },
    { name: 'Itaú', logo: '/banks/itau.svg', hint: 'Hasta 7 dígitos.', placeholder: '1234567' },
    { name: 'Santander', logo: '/banks/santander.svg', hint: 'Hasta 12 dígitos, y la sucursal de hasta 4.', placeholder: '000001234567' },
] as const

export const MERCADO_PAGO = 'Mercado Pago'
/** The tab Mercado Pago brings back tells the one the professional left open, so it shows the new account. */
export const MERCADO_PAGO_LINK_CHANNEL = 'oficiosya_mercado_pago_link'
const SEPARATOR = ' · '

export interface PayoutData {
    method: 'MERCADO_PAGO' | 'BANK' | null
    /** One of URUGUAYAN_BANKS, or the name typed under "Otro banco". */
    bank: string
    otherBank: boolean
    /** Santander's branch; empty for the rest. */
    branch: string
    account: string
    /** Whose account it is: the admin checks it against the name the bank shows before transferring. */
    holder: string
}

export const emptyPayout: PayoutData = { method: null, bank: '', otherBank: false, branch: '', account: '', holder: '' }

const digits = (text: string) => text.replace(/\D/g, '')

/** The account as the bank's format writes it, or null if it doesn't fit it. */
export function normalizeAccount({ method, bank, otherBank, branch, account }: PayoutData): string | null {
    const typed = account.trim()
    if (!typed) return null
    if (method !== 'BANK' || otherBank) return typed
    if (/[^\d\s-]/.test(typed)) return null
    if (bank === 'BROU') {
        // Typed whole (14 digits) or as account-subaccount, which is padded with zeros like the bank does
        const [main, sub, ...rest] = typed.split('-').map(digits)
        if (rest.length) return null
        if (sub === undefined) return main.length === 14 ? `${main.slice(0, 9)}-${main.slice(9)}` : null
        return main && sub && main.length <= 9 && sub.length <= 5 ? `${main.padStart(9, '0')}-${sub.padStart(5, '0')}` : null
    }
    if (bank === 'Itaú') {
        const number = digits(typed)
        return number.length <= 7 ? number.padStart(7, '0') : null
    }
    if (bank === 'Santander') {
        const number = digits(typed)
        const office = digits(branch)
        if (!office || office.length > 4 || number.length > 12) return null
        return `${office.padStart(4, '0')}-${number.padStart(12, '0')}`
    }
    return null
}

/**
 * shortcut: stored as one "Provider · account · holder" text the admin reads as it is, instead of separate
 * columns; split it if payouts ever get automated.
 */
export function formatPayout(payout: PayoutData): string {
    const account = normalizeAccount(payout)
    if (!payout.method || !account) return ''
    const provider = payout.method === 'MERCADO_PAGO' ? MERCADO_PAGO : payout.bank.trim()
    return [provider, account, payout.holder.trim()].filter(Boolean).join(SEPARATOR)
}

export function parsePayout(text: string | null | undefined): PayoutData {
    if (!text) return emptyPayout
    const parts = text.split(SEPARATOR)
    // Typed before the choices existed: kept as the account, with the bank still to choose
    if (parts.length === 1) return { ...emptyPayout, method: 'BANK', account: text }
    const [provider, account, ...rest] = parts
    const holder = rest.join(SEPARATOR)
    if (provider === MERCADO_PAGO) return { ...emptyPayout, method: 'MERCADO_PAGO', account, holder }
    if (provider === 'Santander') {
        const [branch, number] = account.split('-')
        return { ...emptyPayout, method: 'BANK', bank: provider, branch: number === undefined ? '' : branch, account: number ?? account, holder }
    }
    const known = URUGUAYAN_BANKS.some(bank => bank.name === provider)
    return { ...emptyPayout, method: 'BANK', bank: provider, otherBank: !known, account, holder }
}

export function validatePayout(current: PayoutData, saved: PayoutData): string {
    if (!current.method) return saved.method ? 'Elegí cómo querés cobrar.' : ''
    if (current.method === 'BANK' && !current.bank.trim()) return current.otherBank ? 'Ingresá el nombre del banco.' : 'Elegí tu banco.'
    if (!current.account.trim()) {
        return current.method === 'BANK' ? 'Ingresá tu número de cuenta.' : 'Ingresá el correo o celular de tu cuenta de Mercado Pago.'
    }
    if (!normalizeAccount(current)) {
        const format = URUGUAYAN_BANKS.find(bank => bank.name === current.bank)
        return `El número de cuenta de ${current.bank} no es válido. ${format?.hint ?? ''}`.trim()
    }
    if (!current.holder.trim()) return 'Ingresá el nombre del titular de la cuenta.'
    if ([current.bank, current.account, current.holder].some(part => part.trim().length > 60)) {
        return 'El banco, la cuenta y el titular pueden tener como máximo 60 caracteres cada uno.'
    }
    return ''
}
