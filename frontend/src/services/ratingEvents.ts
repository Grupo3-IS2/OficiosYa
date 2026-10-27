const EVENT = 'oficiosya:professional-rating'
const STORAGE_KEY = 'oficiosya_rating_changed'

/** Notify mounted consumers and other tabs; never cache a calculated average in the browser. */
export function publishRatingChange(professionalId: string) {
    window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: professionalId }))
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ professionalId, time: Date.now() })) } catch { /* Same-tab updates still work. */ }
}

export function onRatingChange(listener: (professionalId?: string) => void): () => void {
    const local = (event: Event) => listener((event as CustomEvent<string>).detail)
    const stored = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY || !event.newValue) return
        try {
            const value = JSON.parse(event.newValue) as { professionalId?: unknown }
            if (typeof value.professionalId === 'string') listener(value.professionalId)
        } catch { /* Ignore malformed cross-tab notifications. */ }
    }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) listener() }
    window.addEventListener(EVENT, local)
    window.addEventListener('storage', stored)
    window.addEventListener('pageshow', restored)
    return () => {
        window.removeEventListener(EVENT, local)
        window.removeEventListener('storage', stored)
        window.removeEventListener('pageshow', restored)
    }
}
