import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon/Icon'
import './ProfileMenu.css'

interface ProfileMenuProps {
    authenticated: boolean
    onLogout: () => void
}

interface MenuPosition {
    top: number
    left: number
}

function ProfileMenu({ authenticated, onLogout }: ProfileMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 })
    const triggerRef = useRef<HTMLButtonElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current || !dropdownRef.current) {
            return
        }

        const triggerBounds = triggerRef.current.getBoundingClientRect()
        const dropdownBounds = dropdownRef.current.getBoundingClientRect()
        const isMobile = window.innerWidth <= 700
        const horizontalMargin = 8
        const left = Math.min(
            Math.max(horizontalMargin, triggerBounds.right - dropdownBounds.width),
            window.innerWidth - dropdownBounds.width - horizontalMargin,
        )
        const desktopTop = triggerBounds.bottom + horizontalMargin
        const mobileTop = triggerBounds.top - dropdownBounds.height - horizontalMargin
        const top = isMobile && mobileTop >= horizontalMargin
            ? mobileTop
            : desktopTop

        setPosition({ top, left })
    }, [isOpen, authenticated])

    useEffect(() => {
        const handleDocumentClick = (event: MouseEvent) => {
            const target = event.target as Node
            const clickedTrigger = triggerRef.current?.contains(target)
            const clickedDropdown = dropdownRef.current?.contains(target)

            if (!clickedTrigger && !clickedDropdown) {
                setIsOpen(false)
            }
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false)
            }
        }

        document.addEventListener('click', handleDocumentClick)
        document.addEventListener('keydown', handleEscape)

        return () => {
            document.removeEventListener('click', handleDocumentClick)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [])

    const profileLabel = authenticated ? 'Perfil' : 'Iniciar sesión'

    return (
        <>
            <button
                ref={triggerRef}
                className="nav-item profile-menu__trigger"
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => setIsOpen((isMenuOpen) => !isMenuOpen)}
            >
                <Icon name="user" />
                <span>{profileLabel}</span>
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="profile-menu__dropdown"
                    role="menu"
                    style={{ top: position.top, left: position.left }}
                >
                    {authenticated && (
                        <a href="/profile/edit" role="menuitem">
                            Editar perfil
                        </a>
                    )}

                    {authenticated ? (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={onLogout}
                        >
                            Cerrar sesión
                        </button>
                    ) : (
                        <a href="/login" role="menuitem">
                            Iniciar sesión
                        </a>
                    )}
                </div>,
                document.body,
            )}
        </>
    )
}

export default ProfileMenu
