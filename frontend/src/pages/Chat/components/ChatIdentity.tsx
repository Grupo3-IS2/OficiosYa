import avatarPlaceholder from '../../../assets/avatar-placeholder.svg'
import type { Professional } from '../../../types/Professional'

export function ChatAvatar({ name, src }: Readonly<{ name: string; src?: string | null }>) {
    return <img className="chat-avatar" src={src || avatarPlaceholder} alt={`Foto de ${name}`}
        onError={event => { if (event.currentTarget.src !== new URL(avatarPlaceholder, window.location.href).href) event.currentTarget.src = avatarPlaceholder }} />
}

export function TradePills({ professional }: Readonly<{ professional?: Professional | null }>) {
    const trades = professional?.expertiseTrades ?? []
    if (!trades.length) return null
    return <span className="chat-trades">
        {trades.slice(0, 2).map(trade => <span className="chat-trade" key={trade.id} title={trade.tradeName}>{trade.tradeName}</span>)}
        {trades.length > 2 && <span className="chat-trade chat-trade--more" title={trades.slice(2).map(trade => trade.tradeName).join(', ')}>+{trades.length - 2}</span>}
    </span>
}
