import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCommunityReports, setReportStatus } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from './ErrorMessage.jsx'
import { formatDateTime } from '../lib/format.js'

const STATUSES = ['open', 'reviewed', 'dismissed']

// The queue opens on 'open' because that is the only list with work in it.
export function CommunityReports() {
  const { t, language } = useLanguage()
  const [status, setStatus] = useState('open')
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const fetchReports = useCallback(() => {
    void refreshKey
    return listCommunityReports({ status: status || undefined })
  }, [status, refreshKey])
  const { data: reports, error: loadError, loading } = useFetch(fetchReports)

  async function decide(id, decision) {
    setBusy(true)
    setError(null)
    try {
      await setReportStatus(id, decision)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="filter-row">
        <label>
          {t('reports.filterStatus')}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('reports.allStatuses')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`reports.status.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorMessage error={loadError} />
      <ErrorMessage error={error} />
      {loading && <p className="muted">{t('app.loading')}</p>}

      {reports &&
        (reports.length === 0 ? (
          <p className="muted">{t('reports.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table report-table">
              <thead>
                <tr>
                  <th>{t('reports.colTarget')}</th>
                  <th>{t('reports.colReporter')}</th>
                  <th>{t('reports.colReason')}</th>
                  <th>{t('reports.colStatus')}</th>
                  <th>{t('reports.colCreated')}</th>
                  <th>{t('reports.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td className="report-target">
                      <span className="report-kind">
                        {t(`reports.target.${report.targetType}`)}
                      </span>
                      {/* Reported text is student-written: keep its own direction. */}
                      {report.target ? (
                        <Link to={`/community/${report.target.questionId}`} dir="auto">
                          {report.target.excerpt}
                        </Link>
                      ) : null}
                      {/* A removed thread keeps its report readable so an admin
                          still has the context behind it. */}
                      {report.target?.removed && (
                        <span className="report-kind">{t('removal.targetRemoved')}</span>
                      )}
                      {!report.target && <span className="muted">{t('reports.targetGone')}</span>}
                    </td>
                    <td>{report.reporter.name}</td>
                    <td className="report-reason" dir="auto">
                      {report.reason}
                    </td>
                    <td>{t(`reports.status.${report.status}`)}</td>
                    <td className="report-when">{formatDateTime(report.createdAt, language)}</td>
                    <td>
                      {report.status === 'open' && (
                        <div className="report-actions">
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={busy}
                            onClick={() => decide(report.id, 'reviewed')}
                          >
                            {t('reports.markReviewed')}
                          </button>
                          <button
                            type="button"
                            className="link-button"
                            disabled={busy}
                            onClick={() => decide(report.id, 'dismissed')}
                          >
                            {t('reports.dismiss')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  )
}
