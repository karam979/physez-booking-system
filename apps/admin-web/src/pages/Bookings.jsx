import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listBookings } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { BookingTable } from '../components/BookingTable.jsx'
import { ErrorMessage } from '../components/ErrorMessage.jsx'

const STATUSES = ['pending', 'confirmed', 'rejected', 'cancelled', 'completed']

// Filters live in the URL so a filtered view can be linked (e.g. from the
// dashboard's "review pending" button).
export function Bookings() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const status = searchParams.get('status') ?? ''
  const date = searchParams.get('date') ?? ''

  const fetchBookings = useCallback(
    () => listBookings({ status: status || undefined, date: date || undefined }),
    [status, date],
  )
  const { data: bookings, error, loading } = useFetch(fetchBookings)

  function updateFilter(name, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    setSearchParams(next)
  }

  return (
    <section className="stack">
      <h1>{t('bookings.title')}</h1>

      <div className="filter-row">
        <label>
          {t('bookings.filterStatus')}
          <select value={status} onChange={(e) => updateFilter('status', e.target.value)}>
            <option value="">{t('bookings.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('bookings.filterDate')}
          <input type="date" value={date} onChange={(e) => updateFilter('date', e.target.value)} />
        </label>
        {(status || date) && (
          <button type="button" className="button-secondary" onClick={() => setSearchParams({})}>
            {t('bookings.clearFilters')}
          </button>
        )}
      </div>

      <ErrorMessage error={error} />
      {loading && <p className="muted">{t('app.loading')}</p>}
      {bookings &&
        (bookings.length === 0 ? (
          <p className="muted">{t('bookings.empty')}</p>
        ) : (
          <BookingTable bookings={bookings} />
        ))}
    </section>
  )
}
