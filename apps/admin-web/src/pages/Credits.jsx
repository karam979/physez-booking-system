import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listCreditStudents, getStudentCredits, adjustStudentCredits } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { CreditAdjustmentForm } from '../components/CreditAdjustmentForm.jsx'
import { formatDateTime } from '../lib/format.js'

export function Credits() {
  const { t, language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const search = searchParams.get('search') ?? ''
  const studentId = searchParams.get('studentId') ?? ''

  const fetchStudents = useCallback(() => listCreditStudents(search), [search])
  const { data: students, error: listError } = useFetch(fetchStudents)

  const fetchWallet = useCallback(() => {
    void refreshKey
    return studentId ? getStudentCredits(studentId) : Promise.resolve(null)
  }, [studentId, refreshKey])
  const { data: wallet, error: walletError } = useFetch(fetchWallet)

  function updateParam(name, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    setSearchParams(next)
  }

  async function submitAdjustment(draft) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await adjustStudentCredits(studentId, draft)
      setNotice(t('credits.saved'))
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack">
      <h1>{t('credits.title')}</h1>

      <div className="filter-row">
        <label>
          {t('credits.search')}
          <input
            type="search"
            value={search}
            placeholder={t('credits.searchPlaceholder')}
            onChange={(e) => updateParam('search', e.target.value)}
          />
        </label>
      </div>

      <ErrorMessage error={listError} />
      {students && students.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('credits.colStudent')}</th>
                <th>{t('credits.colEmail')}</th>
                <th>{t('credits.colTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => updateParam('studentId', student.id)}
                    >
                      {student.name}
                    </button>
                  </td>
                  <td>{student.email}</td>
                  <td>{student.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {students && students.length === 0 && <p className="muted">{t('credits.noStudents')}</p>}

      <ErrorMessage error={walletError} />
      {wallet && (
        <>
          <h2>{wallet.student.name}</h2>
          <div className="stat-row">
            <div className="card stat">
              <span className="stat-number">{wallet.total}</span>
              <span className="muted">{t('credits.total')}</span>
            </div>
            <div className="card stat">
              <span className="stat-number">{wallet.paid}</span>
              <span className="muted">{t('credits.paid')}</span>
            </div>
            <div className="card stat">
              <span className="stat-number">{wallet.reward}</span>
              <span className="muted">{t('credits.reward')}</span>
            </div>
          </div>

          <CreditAdjustmentForm busy={busy} onSubmit={submitAdjustment} />
          {notice && <p className="notice">{notice}</p>}
          <ErrorMessage error={error} />

          <h2>{t('credits.history')}</h2>
          {wallet.transactions.length === 0 ? (
            <p className="muted">{t('credits.noTransactions')}</p>
          ) : (
            <ul className="window-list">
              {wallet.transactions.map((entry) => (
                <li key={entry.id}>
                  <span className={entry.amount > 0 ? 'credit-plus' : 'credit-minus'}>
                    {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                  </span>
                  <span>{t(`creditType.${entry.transactionType}`)}</span>
                  <span className="muted">{entry.description}</span>
                  <span className="muted">{formatDateTime(entry.createdAt, language)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
