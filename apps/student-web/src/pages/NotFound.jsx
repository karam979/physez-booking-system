import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'

export function NotFound() {
  const { t } = useLanguage()
  return (
    <section className="hero">
      <h1>{t('notFound.title')}</h1>
      <Link className="button" to="/">
        {t('notFound.back')}
      </Link>
    </section>
  )
}
