import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBooking, getLesson, saveLesson } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { LessonForm } from '../components/LessonForm.jsx'
import { formatDateTime, topicName } from '../lib/format.js'

const EMPTY_DRAFT = { attendance: 'present', summary: '', homework: '', feedback: '' }

function toDraft(lesson) {
  if (!lesson) return EMPTY_DRAFT
  return {
    attendance: lesson.attendance ?? 'present',
    summary: lesson.summary ?? '',
    homework: lesson.homework ?? '',
    feedback: lesson.feedback ?? '',
  }
}

// Writes the one lesson record for a booking. Saving also completes the
// booking, so the same form serves both "write" and "edit".
export function LessonEditor() {
  const { bookingId } = useParams()
  const { t, language } = useLanguage()
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchBooking = useCallback(() => getBooking(bookingId), [bookingId])
  const { data: booking, error: bookingError } = useFetch(fetchBooking)

  // A 404 just means no summary has been written yet.
  const fetchLesson = useCallback(() => getLesson(bookingId).catch(() => null), [bookingId])
  const { data: lesson, loading: lessonLoading } = useFetch(fetchLesson)

  async function save(draft) {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await saveLesson(bookingId, draft)
      setNotice(t('lesson.saved'))
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  if (bookingError) return <ErrorMessage error={bookingError} />
  if (!booking || lessonLoading) return <p className="muted">{t('app.loading')}</p>

  return (
    <section className="stack">
      <h1>{t('lesson.title')}</h1>
      <p className="muted">
        {topicName(booking.topic, language)} · {formatDateTime(booking.startAt, language)}
      </p>

      <LessonForm
        key={lesson?.id ?? 'new'}
        initial={toDraft(lesson)}
        saving={saving}
        error={error}
        notice={notice}
        onSave={save}
      />

      <Link to={`/bookings/${bookingId}`} className="muted">
        {t('lesson.backToBooking')}
      </Link>
    </section>
  )
}
