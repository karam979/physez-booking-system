import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCommunityQuestion, setQuestionStatus } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { formatDateTime, topicName } from '../lib/format.js'
import { LANGUAGE_NAMES } from '../i18n/index.js'

// Moderation is limited to closing and reopening: content is never deleted and
// credits already earned are never reversed here.
export function CommunityQuestion() {
  const { id } = useParams()
  const { t, language } = useLanguage()
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const fetchQuestion = useCallback(() => {
    void refreshKey
    return getCommunityQuestion(id)
  }, [id, refreshKey])

  const { data: question, error: loadError } = useFetch(fetchQuestion)

  async function changeStatus(status) {
    setBusy(true)
    setError(null)
    try {
      await setQuestionStatus(id, status)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <ErrorMessage error={loadError} />
  if (!question) return <p className="muted">{t('app.loading')}</p>

  return (
    <section className="stack">
      <div className="booking-card-row">
        {/* Student-written content keeps its own direction in an ar/he UI. */}
        <h1 dir="auto">{question.title}</h1>
        <span className="muted">{t(`community.status.${question.status}`)}</span>
      </div>

      <article className="card stack">
        <p className="muted">
          {topicName(question.topic, language)} · {LANGUAGE_NAMES[question.language]} ·{' '}
          {t('community.askedBy', { name: question.author.name })} ·{' '}
          {formatDateTime(question.createdAt, language)}
        </p>
        <p className="question-body" dir="auto">
          {question.body}
        </p>
      </article>

      <ErrorMessage error={error} />
      <div className="wizard-nav">
        {question.status === 'closed' ? (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => changeStatus('open')}
          >
            {t('community.reopen')}
          </button>
        ) : (
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => changeStatus('closed')}
          >
            {t('community.close')}
          </button>
        )}
      </div>

      <h2>{t('community.answers', { n: question.answers.length })}</h2>
      {question.answers.length === 0 && <p className="muted">{t('community.noAnswers')}</p>}
      <div className="stack">
        {question.answers.map((answer) => (
          <article key={answer.id} className="card stack">
            {answer.isAccepted && <p className="accepted-flag">✓ {t('community.accepted')}</p>}
            <p className="answer-body" dir="auto">
              {answer.body}
            </p>
            <p className="muted">
              {t('community.answeredBy', { name: answer.author.name })} ·{' '}
              {t('community.helpfulCount', { n: answer.voteCount })} ·{' '}
              {formatDateTime(answer.createdAt, language)}
            </p>
          </article>
        ))}
      </div>

      <Link to="/community" className="muted">
        {t('community.backToList')}
      </Link>
    </section>
  )
}
