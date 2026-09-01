import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { askQuestion } from '../api/community.js'
import { listTopics } from '../api/topics.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { LANGUAGE_NAMES } from '../i18n/index.js'
import { topicName } from '../lib/format.js'

const TITLE_MIN = 5
const BODY_MIN = 10

export function AskQuestion() {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const [topicId, setTopicId] = useState('')
  const [questionLanguage, setQuestionLanguage] = useState(language)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchTopics = useCallback(() => listTopics(), [])
  const { data: topics, error: topicsError } = useFetch(fetchTopics)

  // Mirrors the server rules so the button explains itself before submitting.
  const isComplete =
    topicId !== '' && title.trim().length >= TITLE_MIN && body.trim().length >= BODY_MIN

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await askQuestion({ topicId, language: questionLanguage, title, body })
      navigate(`/community/questions/${created.id}`)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (topicsError) return <ErrorMessage error={topicsError} />
  if (!topics) return <p className="muted">{t('app.loading')}</p>

  return (
    <section className="stack">
      <h1>{t('community.askTitle')}</h1>
      <form className="card stack" onSubmit={handleSubmit}>
        <label>
          {t('community.topic')}
          <select required value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">{t('community.chooseTopic')}</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topicName(topic, language)}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('community.language')}
          <select value={questionLanguage} onChange={(e) => setQuestionLanguage(e.target.value)}>
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('community.questionTitle')}
          <input
            required
            minLength={TITLE_MIN}
            maxLength={200}
            value={title}
            placeholder={t('community.titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label>
          {t('community.questionBody')}
          <textarea
            required
            rows={6}
            minLength={BODY_MIN}
            maxLength={5000}
            value={body}
            placeholder={t('community.bodyPlaceholder')}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        <ErrorMessage error={error} />
        <button className="button" type="submit" disabled={submitting || !isComplete}>
          {submitting ? t('community.posting') : t('community.post')}
        </button>
      </form>
    </section>
  )
}
