import { useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '../../services/api'
import { getCurrentUser, verifyToken } from '../../services/authService'
import { clearSession, getSessionDestination, getToken, isTokenUsable, subscribeSession } from '../../services/session'
import { resumeSession } from '../../services/sessionRenewal'
import { SessionContext, type SessionState } from './useSession'
import './SessionProvider.css'

function storedSession(): SessionState {
    const destination = getSessionDestination()
    if (destination) return { status: 'redirecting', user: null, destination }
    const user = getCurrentUser()
    return user && isTokenUsable(getToken())
        ? { status: 'authenticated', user }
        : { status: 'anonymous', user: null }
}

// StrictMode and simultaneous consumers must share one restoration/verification request.
let pending: Promise<SessionState> | null = null
function checkSession(): Promise<SessionState> {
    pending ??= (async (): Promise<SessionState> => {
        try {
            const hadToken = getToken() !== null
            const outcome = await resumeSession()
            if (outcome === 'unavailable') return { status: 'unavailable', user: null }
            if (outcome === 'expired') return { status: 'anonymous', user: null, expired: hadToken }
            const result = await verifyToken()
            if (result.verified) return storedSession()
            clearSession()
            return { status: 'anonymous', user: null, expired: true }
        } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                clearSession()
                return { status: 'anonymous', user: null, expired: true }
            }
            return { status: 'unavailable', user: null }
        }
    })().finally(() => { pending = null })
    return pending
}

export default function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
    const [session, setSession] = useState<SessionState>({ status: 'checking', user: null })
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
        if (session.status === 'redirecting' && session.destination) window.location.replace(session.destination)
    }, [session.status, session.destination])
    useEffect(() => {
        let active = true
        let checking = true
        const unsubscribe = subscribeSession(() => {
            if (!checking) setSession(storedSession())
        })
        void checkSession().then(result => {
            checking = false
            if (active) setSession(result)
        })
        return () => { active = false; unsubscribe() }
    }, [attempt])

    return <SessionContext.Provider value={session}>
        {session.status === 'redirecting' ? <div className="session-status"><output>Redirigiendo...</output></div>
            : session.status === 'checking' ? <div className="session-status"><output>Comprobando sesión...</output></div>
            : session.status === 'unavailable' ? <div className="session-status" role="alert">
                <p>No pudimos comprobar tu sesión. Revisá tu conexión e intentá nuevamente.</p>
                <button type="button" onClick={() => { setSession({ status: 'checking', user: null }); setAttempt(value => value + 1) }}>Reintentar</button>
            </div> : children}
    </SessionContext.Provider>
}
