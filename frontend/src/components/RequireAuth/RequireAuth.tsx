import { useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '../../services/api'
import { verifyToken } from '../../services/authService'
import { expireSession, getToken, isTokenUsable } from '../../services/session'
import { isTokenFresh, renewSession } from '../../services/sessionRenewal'

type Status = 'checking' | 'verified' | 'unavailable'

/** Renders its children only once the backend confirms the stored token is still valid. */
export default function RequireAuth({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<Status>('checking')
    // Read once: StrictMode runs the effect twice, and the first run may already have cleared the token.
    const [token] = useState(getToken)

    useEffect(() => {
        if (!token) {
            window.location.href = '/login'
            return
        }

        let active = true
        const check = async () => {
            // An expired access token is not the end of the session: the refresh cookie may renew it
            if (!isTokenFresh(token)) {
                const outcome = await renewSession(token)
                if (!active) return
                if (outcome === 'expired') {
                    expireSession()
                    return
                }
                if (outcome === 'unavailable' && !isTokenUsable(getToken())) {
                    setStatus('unavailable')
                    return
                }
            }

            try {
                const response = await verifyToken()
                if (!active) return
                if (response.verified) setStatus('verified')
                else expireSession()
            } catch (reason) {
                if (!active) return
                if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) expireSession()
                else setStatus('unavailable')
            }
        }
        void check()
        return () => { active = false }
    }, [token])

    if (status === 'verified') return children
    if (status === 'unavailable') {
        return <p role="alert">No pudimos verificar tu sesión. Revisá tu conexión e intentá nuevamente.</p>
    }
    return <output>Verificando sesión...</output>
}
