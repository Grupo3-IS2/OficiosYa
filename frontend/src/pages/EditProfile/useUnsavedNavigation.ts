import { useCallback, useEffect, useRef, useState } from 'react'

export default function useUnsavedNavigation(hasChanges: boolean, busy: boolean) {
    const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
    const allowExit = useRef(false)

    // A future router can pass () => navigate(destination) through this same guard.
    const requestNavigation = useCallback((navigate: () => void) => {
        if (busy) return
        if (hasChanges) setPendingNavigation(() => navigate)
        else navigate()
    }, [hasChanges, busy])

    useEffect(() => {
        function handleClick(event: MouseEvent) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            const link = event.target instanceof Element ? event.target.closest('a[href]') : null
            if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
            const destination = new URL(link.href, window.location.href)
            if (!['http:', 'https:'].includes(destination.protocol)) return
            if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.origin === window.location.origin && destination.hash) return
            event.preventDefault()
            requestNavigation(() => window.location.assign(destination.href))
        }
        function handleBeforeUnload(event: BeforeUnloadEvent) {
            if ((!hasChanges && !busy) || allowExit.current) return
            event.preventDefault()
            event.returnValue = ''
        }
        document.addEventListener('click', handleClick)
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => {
            document.removeEventListener('click', handleClick)
            window.removeEventListener('beforeunload', handleBeforeUnload)
        }
    }, [hasChanges, busy, requestNavigation])

    function continueNavigation() {
        if (!pendingNavigation) return
        allowExit.current = true
        setPendingNavigation(null)
        pendingNavigation()
    }

    return {
        isOpen: pendingNavigation !== null,
        requestNavigation,
        continueNavigation,
        cancelNavigation: () => { if (!busy) setPendingNavigation(null) },
    }
}
