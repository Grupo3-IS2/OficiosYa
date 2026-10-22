import { createContext, useContext } from 'react'
import type { StoredUser } from '../../types/Auth'

export interface SessionState {
    status: 'checking' | 'authenticated' | 'anonymous' | 'unavailable' | 'redirecting'
    user: StoredUser | null
    destination?: string
    expired?: boolean
}
export const SessionContext = createContext<SessionState>({ status: 'checking', user: null })
export function useSession(): SessionState { return useContext(SessionContext) }
