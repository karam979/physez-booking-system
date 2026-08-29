import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBookings } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ErrorMessage } from '../components/ErrorMessage.jsx'

function todayDateString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function Dashboard() {
  const { t } = useLanguage()
  const [pendingCount, setPendingCount] = useState(null)
  const [todayCount, setTodayCount] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      listBookings({ status: 'pending' }),
      listBookings({ status: 'confirmed', date: todayDateString() }),
    ])
      .then(([pending, today]) => {
        setPendingCount(pending.length)
        setTodayCount(today.length)
      })
      .catch(setError)
  }, [])

  if (error) return <ErrorMessage error={error} />
  if (pendingCount === null) return <p className="muted">{t('app.loading')}</p>

  return (
    <section className="stack">
      <h1>{t('dashboard.title')}</h1>
      <div className="stat-row">
        <div className="card stat">
          <span className="stat-number">{pendingCount}</span>
          <span className="muted">{t('dashboard.pending')}</span>
        </div>
        <div className="card stat">
          <span className="stat-number">{todayCount}</span>
          <span className="muted">{t('dashboard.today')}</span>
        </div>
      </div>
      <Link className="button" to="/bookings?status=pending">
        {t('dashboard.reviewCta')}
      </Link>
    </section>
  )
}
