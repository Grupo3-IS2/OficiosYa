import type { ReactNode, SVGProps } from 'react'
import './Icon.css'

export type IconName = 'location' | 'document' | 'user' | 'search' | 'money' | 'calendar' | 'star' | 'wrench' | 'home' | 'mail' | 'lock' | 'eye' | 'eye-off'
interface IconProps extends SVGProps<SVGSVGElement> { name: IconName }

function Icon({ name, ...props }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    location: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.3" /></>,
    document: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21c.8-3.7 3.1-5.5 7-5.5s6.2 1.8 7 5.5" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 5 5" /></>,
    money: <path d="M12 3v18M16 7.2c-.8-.8-2-1.2-3.8-1.2-2.1 0-3.7 1.1-3.7 2.7 0 4.2 7.5 1.8 7.5 5.9 0 1.7-1.5 2.8-3.8 2.8-1.8 0-3.1-.5-4.2-1.5" />,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    wrench: <path d="M14.7 5.1a4.6 4.6 0 0 0-5.8 5.8L3.7 16a2.2 2.2 0 1 0 3.1 3.1l4.9-5.2a4.6 4.6 0 0 0 5.8-5.8l-3.1 3.1-2.5-.7-.7-2.5 3.1-2.9Z" />,
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    'eye-off': <><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17.4 17.4 0 0 1-3.2 3.7M6.2 6.7C3.5 8.5 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" {...props}>{paths[name]}</svg>
}

export default Icon
