import { useState } from 'react'
import Button from '../Button/Button'
import Icon from '../Icon/Icon'
import ProfileMenu from '../ProfileMenu/ProfileMenu'
import {
    getRegistrationProfile,
    isAuthenticated,
    logout,
} from '../../services/authService'
import './Header.css'

function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [authenticated, setAuthenticated] = useState(isAuthenticated)
    const profile = getRegistrationProfile()
    const isProfessional = profile?.accountType === 'professional'
    const professionalLabel = !authenticated
        ? 'Soy profesional'
        : isProfessional
            ? 'Panel profesional'
            : 'Convertirse en profesional'

    const toggleMenu = () => {
        setIsMenuOpen((isOpen) => !isOpen)
    }

    const handleLogout = () => {
        logout()
        setAuthenticated(false)
        window.location.href = '/'
    }

    return (
        <header className="site-header">
            <a className="brand" href="#top" aria-label="OficiosYa inicio">
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
                <button className="nav-item" type="button">
                    <Icon name="location" />
                    <span>Montevideo</span>
                    <span className="nav-chevron" aria-hidden="true" />
                </button>
                <button className="nav-item" type="button">
                    <Icon name="document" />
                    <span>Mis solicitudes</span>
                </button>

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
