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
        {/* The signed-in name already comes from AuthContext's /api/auth/me
            hydration, so greeting the student costs no extra request. */}
        {user && (
          <p className="greeting" dir="auto">
            {user.name ? t('greeting.withName', { name: user.name }) : t('greeting.fallback')}
          </p>
        )}
        <nav className="nav">
          {user ? (
            <>
              <NavLink to="/dashboard">{t('nav.dashboard')}</NavLink>
              <NavLink to="/book">{t('nav.book')}</NavLink>
              <NavLink to="/community">{t('nav.community')}</NavLink>
              <NavLink to="/progress">{t('nav.progress')}</NavLink>
              <button type="button" className="link-button" onClick={logout}>
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">{t('nav.login')}</NavLink>
              <NavLink to="/register">{t('nav.register')}</NavLink>
            </>
          )}
          <LanguageSwitcher />
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  )
}
