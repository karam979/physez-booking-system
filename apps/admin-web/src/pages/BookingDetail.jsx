import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getBooking,
  confirmBooking,
  rejectBooking,
  cancelBooking,
  decideReschedule,
} from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { FileList } from '../components/FileList.jsx'
import { LANGUAGE_NAMES } from '../i18n/index.js'
import { formatDateTime, topicName } from '../lib/format.js'

const CANCELLABLE_STATUSES = ['pending', 'confirmed']

export function BookingDetail() {
  const { id } = useParams()
  const { t, language } = useLanguage()
  const [refreshKey, setRefreshKey] = useState(0)
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const fetchBooking = useCallback(() => {
    void refreshKey
    return getBooking(id)
  }, [id, refreshKey])

  const { data: booking, error } = useFetch(fetchBooking)

  // Every action reloads from the server: a conflict means our copy is stale.
  async function run(action, successKey) {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await action()
      setNotice(t(successKey))
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
      setRefreshKey((key) => key + 1)
    }
  }

  if (error) return <ErrorMessage error={error} />
  if (!booking) return <p className="muted">{t('app.loading')}</p>

  const rows = [
    [t('booking.topic'), topicName(booking.topic, language)],
    [t('booking.type'), t(`lessonType.${booking.lessonType}`)],
    [t('booking.language'), LANGUAGE_NAMES[booking.language] ?? booking.language],
    [t('booking.time'), formatDateTime(booking.startAt, language)],
    [t('booking.duration'), t('minutes', { n: booking.durationMinutes })],
  ]

  return (
    <section className="stack">
      <div className="booking-card-row">
        <h1>{t('booking.title')}</h1>
        <StatusBadge status={booking.status} />
      </div>

      <dl className="summary card">
        {rows.map(([label, value]) => (
          <div key={label} className="summary-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        {booking.notes && (
          <div className="summary-row">
            <dt>{t('booking.notes')}</dt>
            <dd>{booking.notes}</dd>
          </div>
        )}
      </dl>

      {booking.status === 'confirmed' && booking.calendarSyncStatus && (
        <p className={booking.calendarSyncStatus === 'failed' ? 'error' : 'muted'}>
          {t(`calendar.${booking.calendarSyncStatus}`)}
        </p>
      )}

      <FileList bookingId={booking.id} />

      {booking.rescheduleRequest && (
        <div className="card stack">
          <strong>
            {t('reschedule.requested', {
              time: formatDateTime(booking.rescheduleRequest.requestedStartAt, language),
            })}
          </strong>
          <div className="wizard-nav">
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() => run(() => decideReschedule(id, 'reject'), 'reschedule.rejected')}
            >
              {t('reschedule.reject')}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => run(() => decideReschedule(id, 'approve'), 'reschedule.approved')}
            >
              {t('reschedule.approve')}
            </button>
          </div>
        </div>
      )}

      {notice && <p className="notice">{notice}</p>}
      <ErrorMessage error={actionError} />

      {booking.status === 'pending' && (
        <div className="wizard-nav">
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => run(() => rejectBooking(id), 'booking.rejected')}
          >
            {t('booking.reject')}
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => run(() => confirmBooking(id), 'booking.confirmed')}
          >
            {t('booking.confirm')}
          </button>
        </div>
      )}

      {CANCELLABLE_STATUSES.includes(booking.status) && (
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => run(() => cancelBooking(id), 'booking.cancelled')}
        >
          {t('booking.cancel')}
        </button>
      )}

      {['confirmed', 'completed'].includes(booking.status) && (
        <Link className="button-secondary" to={`/lessons/${booking.id}`}>
          {t('lesson.open')}
        </Link>
      )}

      <Link to="/bookings" className="muted">
        {t('booking.backToList')}
      </Link>
    </section>
  )
}
