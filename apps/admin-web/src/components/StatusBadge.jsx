import { useLanguage } from '../context/LanguageContext.jsx'

export function StatusBadge({ status }) {
  const { t } = useLanguage()
  return <span className={`badge badge-${status}`}>{t(`status.${status}`)}</span>
}
