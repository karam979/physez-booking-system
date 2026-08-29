import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { LanguageSwitcher } from './LanguageSwitcher.jsx'

export function Layout({ children }) {
  const { user, logout } = useAuth()
  const { t } = useLanguage()

  return (
    <div className="layout">
      <header className="header">
        <Link to="/" className="brand">
          {t('app.name')}
        </Link>
        <nav className="nav">
          {user && (
            <>
              <NavLink to="/" end>
                {t('nav.dashboard')}
              </NavLink>
              <NavLink to="/bookings">{t('nav.bookings')}</NavLink>
              <NavLink to="/availability">{t('nav.availability')}</NavLink>
              <button type="button" className="link-button" onClick={logout}>
                {t('nav.logout')}
              </button>
            </>
          )}
          <LanguageSwitcher />
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  )
}
