import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const { t } = useLanguage()

  if (loading) return <p className="muted">{t('app.loading')}</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}
