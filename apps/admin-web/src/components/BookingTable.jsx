import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { StatusBadge } from './StatusBadge.jsx'
import { formatDateTime, topicName } from '../lib/format.js'

export function BookingTable({ bookings }) {
  const { t, language } = useLanguage()

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('bookings.colStudent')}</th>
            <th>{t('bookings.colTopic')}</th>
            <th>{t('bookings.colTime')}</th>
            <th>{t('bookings.colType')}</th>
            <th>{t('bookings.colStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td>
                <Link to={`/bookings/${booking.id}`}>{booking.student.name}</Link>
              </td>
              <td>{topicName(booking.topic, language)}</td>
              <td>{formatDateTime(booking.startAt, language)}</td>
              <td>
                {t(`lessonType.${booking.lessonType}`)} ·{' '}
                {t('minutes', { n: booking.durationMinutes })}
              </td>
              <td>
                <StatusBadge status={booking.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
