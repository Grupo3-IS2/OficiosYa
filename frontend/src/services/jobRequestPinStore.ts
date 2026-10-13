const PIN_STORAGE_PREFIX = 'oficiosya_job_request_pins:'

type PinStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageKey(clientId: string): string {
    return `${PIN_STORAGE_PREFIX}${clientId}`
}

function readPins(clientId: string, storage: PinStorage): Record<string, string> {
    try {
        const value = JSON.parse(storage.getItem(storageKey(clientId)) ?? '{}') as unknown
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

        return Object.fromEntries(
            Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
    } catch {
        return {}
    }
}

/** Keeps the one-time PIN available to the client on this browser. The backend stores only its hash. */
export function saveJobRequestPin(clientId: string, requestId: number, pin: string, storage: PinStorage = localStorage): void {
    if (!clientId || !pin) return
    try {
        storage.setItem(storageKey(clientId), JSON.stringify({
            ...readPins(clientId, storage),
            [requestId]: pin,
        }))
    } catch {
        // Storage can be unavailable (private mode or quota). The created request must still succeed.
    }
}

export function getJobRequestPin(clientId: string, requestId: number, storage: PinStorage = localStorage): string | null {
    return readPins(clientId, storage)[requestId] ?? null
}
