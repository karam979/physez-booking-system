import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { StatusBadge } from './StatusBadge.jsx'
import { formatDateTime, topicName } from '../lib/format.js'

export function BookingCard({ booking }) {
  const { t, language } = useLanguage()

  return (
    <Link to={`/bookings/${booking.id}`} className="card booking-card">
      <div className="booking-card-row">
        <strong>{topicName(booking.topic, language)}</strong>
        <StatusBadge status={booking.status} />
      </div>
      <div className="booking-card-row muted">
        <span>{formatDateTime(booking.startAt, language)}</span>
        <span>
          {t(`wizard.lessonType.${booking.lessonType}`)} ·{' '}
          {t('wizard.minutes', { n: booking.durationMinutes })}
        </span>
      </div>
    </Link>
  )
}
