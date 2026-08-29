import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export function Landing() {
  const { user } = useAuth()
  const { t } = useLanguage()

  return (
    <section className="hero">
      <h1>{t('landing.title')}</h1>
      <p className="muted">{t('landing.subtitle')}</p>
      <Link className="button" to={user ? '/book' : '/register'}>
        {t('landing.cta')}
      </Link>
    </section>
  )
}
