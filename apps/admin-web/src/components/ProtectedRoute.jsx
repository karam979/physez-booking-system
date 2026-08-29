import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

// The admin app requires the admin role, not just a session — a student
// account that somehow logs in here is sent back to /login.
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const { t } = useLanguage()

  if (loading) return <p className="muted">{t('app.loading')}</p>
  if (!user || user.role !== 'admin') return <Navigate to="/login" replace />
  return children
}
