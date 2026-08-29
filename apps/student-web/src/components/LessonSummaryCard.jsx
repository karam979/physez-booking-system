import { useLanguage } from '../context/LanguageContext.jsx'
import { formatDateTime, topicName } from '../lib/format.js'

export function LessonSummaryCard({ lesson }) {
  const { t, language } = useLanguage()

  const notes = [
    ['booking.summary', lesson.summary],
    ['booking.homework', lesson.homework],
    ['booking.feedback', lesson.feedback],
  ].filter(([, value]) => value)

  return (
    <article className="card stack">
      <div className="booking-card-row">
        <strong>{topicName(lesson.topic, language)}</strong>
        <span className="muted">{formatDateTime(lesson.startAt, language)}</span>
      </div>
      {lesson.attendance && <p className="muted">{t(`attendance.${lesson.attendance}`)}</p>}
      {notes.map(([key, value]) => (
        <div key={key}>
          <strong className="note-label">{t(key)}</strong>
          <p>{value}</p>
        </div>
      ))}
    </article>
  )
}
