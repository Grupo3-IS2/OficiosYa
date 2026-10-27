import { useEffect } from 'react'
import { toast } from 'sonner'
import { useSession } from '../../components/SessionProvider/useSession'
import { getAuthenticatedUser, isProfessionalResponse } from '../../services/userService'

/** Asked once per user and browser session, so the profile isn't fetched on every visit to the home page. */
const CHECKED_KEY = 'oficiosya_service_area_checked:'

function alreadyChecked(userId: string) {
    try { return sessionStorage.getItem(CHECKED_KEY + userId) !== null } catch { return false }
}

function markChecked(userId: string) {
    try { sessionStorage.setItem(CHECKED_KEY + userId, '1') } catch { /* without storage it is asked again next time */ }
}

/**
 * Professionals from before service areas existed don't show up when clients search by distance until
 * they mark theirs: after logging in they are told so, with a way to do it.
 */
export function useServiceAreaReminder() {
    const { status, user } = useSession()
    const professionalId = status === 'authenticated' && user?.role === 'PROFESSIONAL' ? user.id : null

    useEffect(() => {
        if (!professionalId || alreadyChecked(professionalId)) return
        let active = true
        getAuthenticatedUser()
            .then(profile => {
                if (!active) return
                markChecked(professionalId)
                if (!isProfessionalResponse(profile) || profile.serviceArea) return
                toast('Marcá en el mapa hasta dónde llegás para aparecer en las búsquedas por cercanía.', {
                    duration: 15_000,
                    action: { label: 'Marcar mi zona', onClick: () => { window.location.href = '/profile/edit' } },
                })
            })
            .catch(() => { /* only a reminder: it is tried again on the next visit */ })
        return () => { active = false }
    }, [professionalId])
}
