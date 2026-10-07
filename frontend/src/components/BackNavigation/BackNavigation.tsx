import type { ReactNode } from 'react'
import './BackNavigation.css'

interface BackNavigationProps {
    children: ReactNode
    href?: string
    onClick?: () => void
}

export default function BackNavigation({ children, href, onClick }: BackNavigationProps) {
    const content = <><span aria-hidden="true">←</span>{children}</>

    if (href) return <a className="back-navigation" href={href}>{content}</a>

    return <button className="back-navigation" type="button" onClick={onClick}>{content}</button>
}
