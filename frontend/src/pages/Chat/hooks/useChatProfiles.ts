import { useEffect, useState } from 'react'
import { getPublicProfessional } from '../../../services/professionalService'
import type { Professional } from '../../../types/Professional'

/** Session cache includes misses and in-flight lookups, shared by header and list. Roles are historical. */
const profiles = new Map<string, Promise<Professional | null>>()
function lookup(ownerId: string, id: string) {
    const key = `${ownerId}:${id}`
    if (!profiles.has(key)) profiles.set(key, getPublicProfessional(id).catch(() => null))
    return profiles.get(key)!
}

export function useChatProfiles(ownerId: string, ids: string[]) {
    const [result, setResult] = useState<Record<string, Professional | null>>({})
    const key = [...new Set(ids)].sort().join(',')
    useEffect(() => {
        let active = true
        const queue = key ? key.split(',') : []
        // Bound parallel optional requests even for a large inbox.
        const worker = async () => {
            while (queue.length && active) {
                const id = queue.shift()!
                const profile = await lookup(ownerId, id)
                if (active) setResult(previous => ({ ...previous, [id]: profile }))
            }
        }
        void Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
        return () => { active = false }
    }, [ownerId, key])
    return result
}
