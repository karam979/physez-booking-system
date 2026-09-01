import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listCommunityQuestions } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { CommunityReports } from '../components/CommunityReports.jsx'
import { formatDateTime, topicName } from '../lib/format.js'
import { LANGUAGE_NAMES } from '../i18n/index.js'

const STATUSES = ['open', 'solved', 'closed']

export function Community() {
  const { t, language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const status = searchParams.get('status') ?? ''
  const questionLanguage = searchParams.get('language') ?? ''
  // Reports live behind a tab rather than their own route, so /community/:id
  // stays unambiguous.
  const showReports = searchParams.get('view') === 'reports'

  const fetchQuestions = useCallback(
    () =>
      showReports
        ? Promise.resolve(null)
        : listCommunityQuestions({
            status: status || undefined,
            language: questionLanguage || undefined,
          }),
    [showReports, status, questionLanguage],
  )
  const { data: questions, error, loading } = useFetch(fetchQuestions)

  function updateFilter(name, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    setSearchParams(next)
  }

  return (
    <section className="stack">
      <h1>{t('community.title')}</h1>

      <div className="tab-row">
        <button
          type="button"
          className={showReports ? 'tab' : 'tab tab-active'}
          onClick={() => updateFilter('view', '')}
        >
          {t('community.tabQuestions')}
        </button>
        <button
          type="button"
          className={showReports ? 'tab tab-active' : 'tab'}
          onClick={() => updateFilter('view', 'reports')}
        >
          {t('community.tabReports')}
        </button>
      </div>

      {showReports ? (
        <CommunityReports />
      ) : (
        <>
          <div className="filter-row">
            <label>
              {t('community.filterStatus')}
              <select value={status} onChange={(e) => updateFilter('status', e.target.value)}>
                <option value="">{t('community.allStatuses')}</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`community.status.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('community.filterLanguage')}
              <select
                value={questionLanguage}
                onChange={(e) => updateFilter('language', e.target.value)}
              >
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
          {loading && <p className="muted">{t('app.loading')}</p>}
          {questions &&
            (questions.length === 0 ? (
              <p className="muted">{t('community.empty')}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('community.colTitle')}</th>
                      <th>{t('community.colTopic')}</th>
                      <th>{t('community.colAnswers')}</th>
                      <th>{t('community.colStatus')}</th>
                      <th>{t('community.colAsked')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((question) => (
                      <tr key={question.id}>
                        <td>
                          {/* Student-written title: keep its own text direction. */}
                          <Link to={`/community/${question.id}`} dir="auto">
                            {question.title}
                          </Link>
                        </td>
                        <td>{topicName(question.topic, language)}</td>
                        <td>{question.answerCount}</td>
                        <td>{t(`community.status.${question.status}`)}</td>
                        <td>{formatDateTime(question.createdAt, language)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </>
      )}
    </section>
  )
}
