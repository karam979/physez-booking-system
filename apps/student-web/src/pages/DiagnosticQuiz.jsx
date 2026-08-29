import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBooking } from '../api/bookings.js'
import { getTopicQuiz, submitAttempt } from '../api/quizzes.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'

// The quiz for a booking's topic. Answers are collected here and scored on
// the server — the client never sees which option is right.
export function DiagnosticQuiz() {
  const { id } = useParams()
  const { t } = useLanguage()
  const [chosen, setChosen] = useState({})
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchBooking = useCallback(() => getBooking(id), [id])
  const { data: booking, error: bookingError } = useFetch(fetchBooking)

  const fetchQuiz = useCallback(
    () => (booking ? getTopicQuiz(booking.topicId) : Promise.resolve(null)),
    [booking],
  )
  const { data: quiz, error: quizError } = useFetch(fetchQuiz)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const answers = Object.entries(chosen).map(([questionId, answer]) => ({ questionId, answer }))
      setResult(await submitAttempt(quiz.id, { answers, bookingId: id }))
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (bookingError) return <ErrorMessage error={bookingError} />
  if (quizError) return <ErrorMessage error={quizError} />
  if (!booking || !quiz) return <p className="muted">{t('app.loading')}</p>

  if (result) {
    return (
      <section className="stack">
        <h1>{t('quiz.resultTitle')}</h1>
        <div className="card stack">
          <p className="quiz-score">{t('quiz.score', { score: result.score })}</p>
          <p className="muted">
            {t('quiz.correctOf', { correct: result.correctCount, total: result.totalQuestions })}
          </p>
          <p className="muted">{t('quiz.resultHint')}</p>
        </div>
        <Link className="button" to={`/bookings/${id}`}>
          {t('quiz.backToBooking')}
        </Link>
      </section>
    )
  }

  const answeredCount = Object.keys(chosen).length

  return (
    <section className="stack">
      <h1>{quiz.title}</h1>
      <p className="muted">{t('quiz.intro')}</p>

      {quiz.questions.map((question, index) => (
        <fieldset key={question.id} className="card stack">
          <legend className="question-legend">
            {t('quiz.questionNumber', { n: index + 1, total: quiz.questions.length })}
          </legend>
          <p className="question-text">{question.questionText}</p>
          <div className="stack">
            {question.options.map((option) => (
              <label key={option} className="option">
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={chosen[question.id] === option}
                  onChange={() => setChosen((current) => ({ ...current, [question.id]: option }))}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <ErrorMessage error={error} />
      <p className="muted">
        {t('quiz.answered', { answered: answeredCount, total: quiz.questions.length })}
      </p>
      <button
        className="button"
        type="button"
        disabled={submitting || answeredCount === 0}
        onClick={submit}
      >
        {t('quiz.submit')}
      </button>
    </section>
  )
}
