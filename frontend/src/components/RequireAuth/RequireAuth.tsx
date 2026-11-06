import { useEffect, type ReactNode } from 'react'
import { useSession } from '../SessionProvider/useSession'

/** All protected routes consume the session already checked at startup. */
export default function RequireAuth({ children, notForAdmin = false }: Readonly<{
    children: ReactNode
    /** For pages about taking part in jobs: an admin is sent to what they do have. */
    notForAdmin?: boolean
}>) {
    const { status, expired, user } = useSession()
    const redirectAdmin = notForAdmin && user?.role === 'ADMIN'
    useEffect(() => {
        if (status === 'anonymous') window.location.replace(expired ? '/login?expired=1' : '/login')
        else if (redirectAdmin) window.location.replace('/admin/transferencias')
    }, [status, expired, redirectAdmin])
    return status === 'authenticated' && !redirectAdmin ? children : null
}
