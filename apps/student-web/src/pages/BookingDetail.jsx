import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBooking, cancelBooking, requestReschedule } from '../api/bookings.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { RescheduleForm } from '../components/RescheduleForm.jsx'
import { FileUploader } from '../components/FileUploader.jsx'
import { LANGUAGE_NAMES } from '../i18n/index.js'
import { formatDateTime, topicName } from '../lib/format.js'

const CHANGEABLE_STATUSES = ['pending', 'confirmed']

export function BookingDetail() {
  const { id } = useParams()
  const { t, language } = useLanguage()
  const [refreshKey, setRefreshKey] = useState(0)
  const [showReschedule, setShowReschedule] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const fetchBooking = useCallback(() => {
    void refreshKey
    return getBooking(id)
  }, [id, refreshKey])

  const { data: booking, error } = useFetch(fetchBooking)

  function reload() {
    setRefreshKey((key) => key + 1)
  }

  async function cancel() {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await cancelBooking(id)
      setNotice(t('booking.cancelled'))
      reload()
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  async function submitReschedule(startAt) {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await requestReschedule(id, { startAt })
      setShowReschedule(false)
      setNotice(t('reschedule.sent'))
      reload()
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorMessage error={error} />
  if (!booking) return <p className="muted">{t('app.loading')}</p>

  const rows = [
    [t('booking.topic'), topicName(booking.topic, language)],
    [t('booking.type'), t(`wizard.lessonType.${booking.lessonType}`)],
    [t('booking.language'), LANGUAGE_NAMES[booking.language] ?? booking.language],
    [t('booking.time'), formatDateTime(booking.startAt, language)],
    [t('booking.duration'), t('wizard.minutes', { n: booking.durationMinutes })],
  ]
  const canChange = CHANGEABLE_STATUSES.includes(booking.status)

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

      {booking.rescheduleRequest && (
        <p className="notice">
          {t('reschedule.awaiting', {
            time: formatDateTime(booking.rescheduleRequest.requestedStartAt, language),
          })}
        </p>
      )}

      {notice && <p className="notice">{notice}</p>}
      <ErrorMessage error={actionError} />

      {canChange && !showReschedule && (
        <div className="wizard-nav">
          <button type="button" className="button-secondary" disabled={busy} onClick={cancel}>
            {t('booking.cancel')}
          </button>
          {!booking.rescheduleRequest && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setShowReschedule(true)}
            >
              {t('reschedule.request')}
            </button>
          )}
        </div>
      )}

      {showReschedule && (
        <RescheduleForm
          durationMinutes={booking.durationMinutes}
          submitting={busy}
          onSubmit={submitReschedule}
          onCancel={() => setShowReschedule(false)}
        />
      )}

      <FileUploader bookingId={booking.id} canEdit={canChange} />

      <Link className="button-secondary" to={`/bookings/${booking.id}/diagnostic`}>
        {t('quiz.take')}
      </Link>
    </section>
  )
}
