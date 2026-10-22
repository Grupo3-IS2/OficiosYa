import { useEffect, type ReactNode } from 'react'
import { useSession } from '../SessionProvider/useSession'

/** All protected routes consume the session already checked at startup. */
export default function RequireAuth({ children }: Readonly<{ children: ReactNode }>) {
    const { status } = useSession()
    useEffect(() => {
        if (status === 'anonymous') window.location.replace('/login')
    }, [status])
    return status === 'authenticated' ? children : null
}
