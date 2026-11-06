import { useState } from 'react'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import { MERCADO_PAGO, URUGUAYAN_BANKS, normalizeAccount, validatePayout, emptyPayout, type PayoutData } from '../payoutAccount'

const MERCADO_PAGO_LOGO = '/banks/mercadopago.svg'

// With linking on, clients pay straight into the professional's Mercado Pago account: a bank account can't take that
const methods = (linkAvailable: boolean) => linkAvailable
    ? [{ value: 'MERCADO_PAGO', title: 'Mercado Pago', detail: 'Vinculás tu cuenta iniciando sesión', logo: MERCADO_PAGO_LOGO }] as const
    : [
        { value: 'MERCADO_PAGO', title: 'Mercado Pago', detail: 'A tu cuenta, con tu correo o celular', logo: MERCADO_PAGO_LOGO },
        { value: 'BANK', title: 'Cuenta bancaria', detail: 'En un banco de Uruguay', logo: null },
    ] as const

/** The saved account, as a card: the bank's logo (or an icon), the account and its holder. */
function PayoutCard({ payout, verified, onEdit }: Readonly<{ payout: PayoutData; verified: boolean; onEdit: () => void }>) {
    const bank = payout.method === 'BANK' && !payout.otherBank ? URUGUAYAN_BANKS.find(item => item.name === payout.bank) : undefined
    const account = normalizeAccount(payout) ?? payout.account
    return <div className="payout-card">
        <div className="payout-card__brand">
            {bank || payout.method === 'MERCADO_PAGO'
                ? <img src={bank?.logo ?? MERCADO_PAGO_LOGO} alt="" />
                : <Icon name="home" />}
        </div>
        <dl className="payout-card__details">
            <dt className="payout-sr-only">Dónde cobrás</dt>
            <dd className="payout-card__provider">
                {payout.method === 'MERCADO_PAGO' ? MERCADO_PAGO : payout.bank}
                {verified && <span className="payout-card__verified"><Icon name="check" />Vinculada</span>}
            </dd>
            <dt className="payout-sr-only">{payout.method === 'BANK' ? 'Número de cuenta' : 'Cuenta de Mercado Pago'}</dt>
            <dd className="payout-card__account">{payout.bank === 'Santander' && !payout.otherBank
                ? `Sucursal ${account.split('-')[0]} · Cuenta ${account.split('-')[1]}`
                : account}</dd>
            <dt>Titular</dt>
            <dd>{payout.holder}</dd>
        </dl>
        <Button type="button" variant="ghost" onClick={onEdit}>Editar</Button>
    </div>
}

/** Where OficiosYa transfers the professional what they earn, minus the commission. Needed to accept jobs. */
export default function PayoutSection({ value, saved, verified, linkAvailable, onChange, onSave, onLink, onUnlink, message, error, profileName }: Readonly<{
    value: PayoutData; saved: PayoutData; onChange: (value: PayoutData) => void; onSave: () => Promise<boolean>
    /** Whether the saved account is a Mercado Pago one the professional linked by logging in. */
    verified: boolean
    /** Whether Mercado Pago is linked by logging in; otherwise its email or phone is typed, like a bank account. */
    linkAvailable: boolean
    /** Opens Mercado Pago's login in another tab; throws the message to show if it can't. */
    onLink: () => Promise<void>
    /** Stops charging into the linked account; throws the message to show if it can't. */
    onUnlink: () => Promise<void>
    message?: string; error?: string
    /** Proposed as the holder: it is usually their own account. */
    profileName: string
}>) {
    // A complete saved account shows as a card; an older one missing its bank or holder opens to be completed
    // With linking on, a typed account no longer counts: it opens to link Mercado Pago
    const savedComplete = Boolean(saved.method) && !validatePayout(saved, emptyPayout) && (verified || !linkAvailable)
    const [editing, setEditing] = useState(false)
    const [linking, setLinking] = useState(false)
    const [linkError, setLinkError] = useState('')

    async function link() {
        setLinking(true)
        setLinkError('')
        try {
            await onLink()
        } catch (failure) {
            setLinkError(failure instanceof Error ? failure.message : 'No pudimos abrir Mercado Pago. Intentá nuevamente.')
        }
        setLinking(false)
    }
    async function unlink() {
        if (!window.confirm('Sin una cuenta vinculada no vas a poder aceptar trabajos. ¿Querés desvincularla?')) return
        setLinking(true)
        setLinkError('')
        try {
            await onUnlink()
        } catch (failure) {
            setLinkError(failure instanceof Error ? failure.message : 'No pudimos desvincular tu cuenta. Intentá nuevamente.')
        }
        setLinking(false)
    }
    const format = value.method === 'BANK' && !value.otherBank ? URUGUAYAN_BANKS.find(bank => bank.name === value.bank) : undefined
    // With linking on, Mercado Pago is linked by logging in, not typed
    const linksMercadoPago = value.method === 'MERCADO_PAGO' && linkAvailable
    const typesAccount = (value.method === 'BANK' && (Boolean(format) || value.otherBank)) || (value.method === 'MERCADO_PAGO' && !linkAvailable)
    const change = (changes: Partial<PayoutData>) => {
        const next = { ...value, ...changes }
        // The holder is asked once there is an account: proposed as the profile's name, still editable
        onChange(next.account.trim() && !next.holder.trim() ? { ...next, holder: profileName } : next)
    }

    return <section className="profile-section payout-section" aria-labelledby="payout-title">
        <h2 id="payout-title">Cobros</h2>
        <p className="profile-subtitle">Necesario para aceptar trabajos.</p>
        {savedComplete && !editing
            ? <>
                <PayoutCard payout={saved} verified={verified} onEdit={() => setEditing(true)} />
                {error && <p className="profile-error" role="alert">{error}</p>}
                {message && <output className="profile-feedback">{message}</output>}
            </>
            : <form onSubmit={event => { event.preventDefault(); void onSave().then(ok => { if (ok) setEditing(false) }) }}>
            <fieldset className="payout-methods">
                <legend>¿Dónde querés cobrar?</legend>
                {methods(linkAvailable).map(method => <label key={method.value} className={`payout-method${value.method === method.value ? ' is-selected' : ''}`}>
                    <input type="radio" name="payout-method" value={method.value} checked={value.method === method.value}
                        onChange={() => change({ method: method.value })} />
                    {method.logo ? <img src={method.logo} alt="" /> : <Icon name="home" />}
                    <span><strong>{method.title}</strong><small>{method.detail}</small></span>
                </label>)}
            </fieldset>

            {value.method === 'BANK' && <fieldset className="payout-banks">
                <legend>Banco</legend>
                {URUGUAYAN_BANKS.map(bank => <label key={bank.name} className={`payout-bank${!value.otherBank && value.bank === bank.name ? ' is-selected' : ''}`}>
                    <input type="radio" name="payout-bank" value={bank.name} checked={!value.otherBank && value.bank === bank.name}
                        onChange={() => change({ bank: bank.name, otherBank: false })} />
                    <img src={bank.logo} alt={bank.name} />
                </label>)}
                <label className={`payout-bank${value.otherBank ? ' is-selected' : ''}`}>
                    <input type="radio" name="payout-bank" value="other" checked={value.otherBank}
                        onChange={() => change({ bank: '', otherBank: true })} />
                    <span className="payout-bank__name">Otro banco</span>
                </label>
            </fieldset>}

            {value.method === 'BANK' && value.otherBank && <div className="profile-field">
                <label htmlFor="payout-other-bank">Nombre del banco</label>
                <input id="payout-other-bank" maxLength={60} value={value.bank} placeholder="Ej: BBVA"
                    onChange={event => change({ bank: event.target.value })} />
            </div>}

            {value.method === 'BANK' && value.bank === 'Santander' && !value.otherBank && <div className="profile-field">
                <label htmlFor="payout-branch">Sucursal</label>
                <input id="payout-branch" maxLength={4} inputMode="numeric" value={value.branch} placeholder="Ej: 0070"
                    onChange={event => change({ branch: event.target.value })} />
            </div>}

            {linksMercadoPago && <div className="payout-link">
                <p>Iniciá sesión en Mercado Pago y autorizá a OficiosYa. Los clientes te pagan directo a esa cuenta y Mercado Pago descuenta la comisión de OficiosYa.</p>
                <Button type="button" className="payout-link__button" disabled={linking} onClick={() => void link()}>
                    <img src={MERCADO_PAGO_LOGO} alt="" />
                    {linking ? 'Abriendo Mercado Pago…' : verified ? 'Vincular otra cuenta' : 'Vincular con Mercado Pago'}
                </Button>
                {verified && <Button type="button" variant="ghost" disabled={linking} onClick={() => void unlink()}>Desvincular cuenta</Button>}
                {linkError && <p className="profile-error" role="alert">{linkError}</p>}
            </div>}

            {typesAccount && <div className="profile-field">
                <label htmlFor="payout-account">{value.method === 'BANK' ? 'Número de cuenta' : 'Correo o celular de Mercado Pago'}</label>
                {format && <small id="payout-account-help">{format.hint}</small>}
                <input id="payout-account" maxLength={60} value={value.account} aria-describedby={format ? 'payout-account-help' : undefined}
                    inputMode={format ? 'numeric' : value.method === 'MERCADO_PAGO' ? 'email' : 'text'}
                    placeholder={format?.placeholder ?? (value.method === 'MERCADO_PAGO' ? 'Ej: ana@correo.com' : '')}
                    onChange={event => change({ account: event.target.value })} />
            </div>}

            {typesAccount && value.account.trim() && <div className="profile-field">
                <label htmlFor="payout-holder">Titular de la cuenta</label>
                <small id="payout-holder-help">Tal como figura en {value.method === 'BANK' ? 'el banco' : 'Mercado Pago'}: antes de transferir lo comparamos con el nombre que nos muestra.</small>
                <input id="payout-holder" maxLength={60} value={value.holder} autoComplete="name" aria-describedby="payout-holder-help"
                    onChange={event => onChange({ ...value, holder: event.target.value })} />
            </div>}

            <div className="profile-actions">
                {savedComplete && <Button type="button" variant="ghost" onClick={() => { onChange(saved); setEditing(false) }}>Cancelar</Button>}
                {value.method && !linksMercadoPago && <Button type="submit">Guardar cambios</Button>}
            </div>
            {error && <p className="profile-error" role="alert">{error}</p>}
            {message && <output className="profile-feedback">{message}</output>}
        </form>}
    </section>
}
