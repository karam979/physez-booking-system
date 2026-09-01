import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getQuestion,
  postAnswer,
  voteAnswer,
  unvoteAnswer,
  acceptAnswer,
} from '../api/community.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { AnswerCard } from '../components/AnswerCard.jsx'
import { ReportControl } from '../components/ReportControl.jsx'
import { formatDateTime, topicName } from '../lib/format.js'
import { LANGUAGE_NAMES } from '../i18n/index.js'
import { useWallet } from '../context/WalletContext.jsx'

const BODY_MIN = 10

export function QuestionDetail() {
  const { id } = useParams()
  const { t, language } = useLanguage()
  const { refreshWallet } = useWallet()
  const [refreshKey, setRefreshKey] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const fetchQuestion = useCallback(() => {
    void refreshKey
    return getQuestion(id)
  }, [id, refreshKey])

  const { data: question, error: loadError } = useFetch(fetchQuestion)

  function reload() {
    setRefreshKey((key) => key + 1)
  }

  // The server decides whether a reward was granted; the UI only reports it
  // and then re-reads the wallet rather than adding up locally.
  function announceReward(reward) {
    if (reward?.granted) {
      setNotice(t('community.rewardEarned', { n: reward.amount }))
      refreshWallet()
    } else {
      setNotice(null)
    }
  }

  async function run(action) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await action()
      announceReward(result?.reward)
      reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function submitAnswer(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await postAnswer(id, body)
      setBody('')
      reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <ErrorMessage error={loadError} />
  if (!question) return <p className="muted">{t('app.loading')}</p>

  const canAnswer = question.status !== 'closed'

  return (
    <section className="stack">
      <div className="booking-card-row">
        <h1>{question.title}</h1>
        <span className={`badge badge-${question.isSolved ? 'confirmed' : 'pending'}`}>
          {t(question.isSolved ? 'community.solved' : 'community.open')}
        </span>
      </div>

      <article className="card stack">
        <p className="muted">
          {topicName(question.topic, language)} · {LANGUAGE_NAMES[question.language]} ·{' '}
          {t('community.askedBy', { name: question.author.name })} ·{' '}
          {formatDateTime(question.createdAt, language)}
        </p>
        <p className="question-body">{question.body}</p>

        {!question.isOwn && (
          <div className="report-row">
            <ReportControl targetType="question" targetId={question.id} />
          </div>
        )}
      </article>

      {notice && <p className="notice">{notice}</p>}
      <ErrorMessage error={error} />

      <h2>{t('community.answerCount', { n: question.answers.length })}</h2>
      {question.answers.length === 0 && <p className="muted">{t('community.noAnswers')}</p>}
      <div className="stack">
        {question.answers.map((answer) => (
          <AnswerCard
            key={answer.id}
            answer={answer}
            canAccept={question.isOwn && !question.acceptedAnswerId && question.status !== 'closed'}
            busy={busy}
            onVote={() => run(() => voteAnswer(answer.id))}
            onUnvote={() => run(() => unvoteAnswer(answer.id))}
            onAccept={() => run(() => acceptAnswer(answer.id))}
          />
        ))}
      </div>

      {canAnswer ? (
        <form className="card stack" onSubmit={submitAnswer}>
          <label>
            {t('community.yourAnswer')}
            <textarea
              required
              rows={4}
              minLength={BODY_MIN}
              maxLength={5000}
              value={body}
              placeholder={t('community.answerPlaceholder')}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button className="button" type="submit" disabled={busy || body.trim().length < BODY_MIN}>
            {t('community.postAnswer')}
          </button>
        </form>
      ) : (
        <p className="muted">{t('community.closedNotice')}</p>
      )}

      <Link to="/community" className="muted">
        {t('community.backToList')}
      </Link>
    </section>
  )
}
