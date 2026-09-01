import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listQuestions } from '../api/community.js'
import { listTopics } from '../api/topics.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { QuestionCard } from '../components/QuestionCard.jsx'
import { LANGUAGE_NAMES } from '../i18n/index.js'

// Filters live in the URL so a filtered view can be shared or reloaded.
export function Community() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const topicId = searchParams.get('topicId') ?? ''
  const view = searchParams.get('view') ?? 'all'
  const language = searchParams.get('language') ?? ''

  const fetchTopics = useCallback(() => listTopics(), [])
  const { data: topics } = useFetch(fetchTopics)

  const fetchQuestions = useCallback(
    () =>
      listQuestions({
        topicId: topicId || undefined,
        language: language || undefined,
        status: view === 'solved' ? 'solved' : undefined,
        unanswered: view === 'unanswered',
      }),
    [topicId, view, language],
  )
  const { data, error } = useFetch(fetchQuestions)

  function updateFilter(name, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    setSearchParams(next)
  }

  return (
    <section className="stack">
      <div className="booking-card-row">
        <h1>{t('community.title')}</h1>
        <Link className="button" to="/community/ask">
          {t('community.ask')}
        </Link>
      </div>

      <div className="filter-row">
        <label>
          {t('community.filterView')}
          <select value={view} onChange={(e) => updateFilter('view', e.target.value)}>
            <option value="all">{t('community.viewAll')}</option>
            <option value="unanswered">{t('community.viewUnanswered')}</option>
            <option value="solved">{t('community.viewSolved')}</option>
          </select>
        </label>
        <label>
          {t('community.filterTopic')}
          <select value={topicId} onChange={(e) => updateFilter('topicId', e.target.value)}>
            <option value="">{t('community.allTopics')}</option>
            {(topics ?? []).map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('community.filterLanguage')}
          <select value={language} onChange={(e) => updateFilter('language', e.target.value)}>
            <option value="">{t('community.allLanguages')}</option>
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorMessage error={error} />
      {!data && !error && <p className="muted">{t('app.loading')}</p>}
      {data &&
        (data.questions.length === 0 ? (
          <p className="muted">{t('community.empty')}</p>
        ) : (
          <div className="stack">
            {data.questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        ))}
    </section>
  )
}
