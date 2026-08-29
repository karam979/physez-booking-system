import { useCallback } from 'react'
import { getMyProgress } from '../api/progress.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { LessonSummaryCard } from '../components/LessonSummaryCard.jsx'
import { formatDateTime } from '../lib/format.js'

export function Progress() {
  const { t, language } = useLanguage()
  const fetchProgress = useCallback(() => getMyProgress(), [])
  const { data: progress, error } = useFetch(fetchProgress)

  if (error) return <ErrorMessage error={error} />
  if (!progress) return <p className="muted">{t('app.loading')}</p>

  const hasHistory = progress.completedLessons > 0 || progress.quizAttempts > 0

  return (
    <section className="stack">
      <h1>{t('progress.title')}</h1>

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-number">{progress.completedLessons}</span>
          <span className="muted">{t('progress.completedLessons')}</span>
        </div>
        <div className="card stat">
          <span className="stat-number">{progress.quizAttempts}</span>
          <span className="muted">{t('progress.quizAttempts')}</span>
        </div>
        <div className="card stat">
          <span className="stat-number">
            {progress.averageScore === null ? '—' : `${progress.averageScore}%`}
          </span>
          <span className="muted">{t('progress.averageScore')}</span>
        </div>
      </div>

      {!hasHistory && <p className="muted">{t('progress.empty')}</p>}

      {progress.lessons.length > 0 && (
        <>
          <h2>{t('progress.lessons')}</h2>
          <div className="stack">
            {progress.lessons.map((lesson) => (
              <LessonSummaryCard key={lesson.bookingId} lesson={lesson} />
            ))}
          </div>
        </>
      )}

      {progress.attempts.length > 0 && (
        <>
          <h2>{t('progress.quizzes')}</h2>
          <ul className="window-list">
            {progress.attempts.map((attempt) => (
              <li key={attempt.id}>
                <span className="score-pill">{attempt.score}%</span>
                <span>{attempt.title}</span>
                <span className="muted">{formatDateTime(attempt.submittedAt, language)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
