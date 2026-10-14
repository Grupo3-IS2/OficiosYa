import { useState } from 'react'
import Button from '../Button/Button'
import Icon from '../Icon/Icon'
import ProfileMenu from './ProfileMenu/ProfileMenu'
import {
    getCurrentUser,
    isAuthenticated,
    logout,
} from '../../services/authService'
import { useAwaitingAnswers } from './useAwaitingAnswers'
import './Header.css'

function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [authenticated, setAuthenticated] = useState(isAuthenticated)
    const user = getCurrentUser()
    const isProfessional = user?.role === 'PROFESSIONAL'
    const professionalLabel = !authenticated
        ? 'Soy profesional'
        : isProfessional
            ? 'Panel profesional'
            : 'Convertirse en profesional'
    const requestsActive = window.location.pathname === '/mis-solicitudes'
    const awaiting = useAwaitingAnswers(authenticated)

    const toggleMenu = () => {
        setIsMenuOpen((isOpen) => !isOpen)
    }

    const handleLogout = async () => {
        await logout()
        setAuthenticated(false)
        window.location.href = '/'
    }

    return (
        <header className="site-header">
            <a className="brand" href="/" aria-label="OficiosYa inicio">
                <span className="brand-mark">
                    <Icon name="wrench" />
                </span>
                <span>Oficios</span>
                <strong>Ya</strong>
            </a>

            {authenticated && (
                <div className="mobile-professional">
                    <Button type="button">{professionalLabel}</Button>
                </div>
            )}

            <button
                className="menu-toggle"
                type="button"
                aria-label="Abrir menú"
                aria-expanded={isMenuOpen}
                onClick={toggleMenu}
            >
                <span />
                <span />
                <span />
            </button>

            <nav
                className={isMenuOpen ? 'is-open' : ''}
                aria-label="Navegación principal"
            >
                {authenticated && (
                    <a
                        className={`nav-item${requestsActive ? ' is-active' : ''}`}
                        href="/mis-solicitudes"
                        aria-current={requestsActive ? 'page' : undefined}
                    >
                        <span className="nav-item__icon">
                            <Icon name="document" />
                            {awaiting > 0 && <b className="nav-alert" aria-hidden="true">!</b>}
                        </span>
                        <span>Mis solicitudes</span>
                        {awaiting > 0 && <span className="nav-alert-text">
                            {awaiting === 1 ? '(1 solicitud espera tu respuesta)' : `(${awaiting} solicitudes esperan tu respuesta)`}
                        </span>}
                    </a>
                )}

                {authenticated ? (
                    <div className="profile-menu">
                        <ProfileMenu
                            authenticated
                            onLogout={handleLogout}
                        />
                    </div>
                ) : (
                    <a className="nav-item auth-login-button" href="/login">
                        <Icon name="user" />
                        <span>Iniciar sesión</span>
                    </a>
                )}

                {authenticated && (
                    <Button type="button">
                        <Icon name="user" />
                        {professionalLabel}
                    </Button>
                )}
            </nav>
        </header>
    )
}

export default Header
