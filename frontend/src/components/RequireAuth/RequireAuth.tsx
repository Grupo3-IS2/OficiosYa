import { useEffect, type ReactNode } from 'react'
import { useSession } from '../SessionProvider/useSession'

/** All protected routes consume the session already checked at startup. */
export default function RequireAuth({ children }: Readonly<{ children: ReactNode }>) {
    const { status, expired } = useSession()
    useEffect(() => {
        if (status === 'anonymous') window.location.replace(expired ? '/login?expired=1' : '/login')
    }, [status, expired])
    return status === 'authenticated' ? children : null
}
