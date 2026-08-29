import { useCallback, useState } from 'react'
import { createSlot, deleteSlot, getAvailability } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { formatTime } from '../lib/format.js'

// DESIGN.md's API has no "list slots" endpoint (only create/delete), so the
// deletable list below shows slots created in this session. Free windows for
// any date come from the public availability endpoint.
export function Availability() {
  const { t, language } = useLanguage()
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('09:00')
  const [to, setTo] = useState('17:00')
  const [createdSlots, setCreatedSlots] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchWindows = useCallback(() => {
    // refreshKey re-runs the fetch after a slot is created or deleted.
    void refreshKey
    return date ? getAvailability(date) : Promise.resolve(null)
  }, [date, refreshKey])

  const { data, error: windowsError } = useFetch(fetchWindows)
  const windows = data?.windows ?? null

  function refreshWindows() {
    setRefreshKey((key) => key + 1)
  }

  async function addSlot(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      // Local wall-clock times → UTC instants; the API stores UTC only.
      const slot = await createSlot({
        startAt: new Date(`${date}T${from}`).toISOString(),
        endAt: new Date(`${date}T${to}`).toISOString(),
      })
      setCreatedSlots((current) => [...current, slot])
      setNotice(t('availability.created'))
      refreshWindows()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  async function removeSlot(id) {
    setError(null)
    setNotice(null)
    try {
      await deleteSlot(id)
      setCreatedSlots((current) => current.filter((slot) => slot.id !== id))
      setNotice(t('availability.deleted'))
      refreshWindows()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <section className="stack">
      <h1>{t('availability.title')}</h1>

      <form className="card filter-row" onSubmit={addSlot}>
        <label>
          {t('availability.date')}
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t('availability.from')}
          <input type="time" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t('availability.to')}
          <input type="time" required value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="button" type="submit" disabled={saving || !date}>
          {t('availability.addSlot')}
        </button>
      </form>

      <ErrorMessage error={error} />
      <ErrorMessage error={windowsError} />
      {notice && <p className="notice">{notice}</p>}

      {date && windows && (
        <div className="card stack">
          <strong>{t('availability.freeOn', { date })}</strong>
          {windows.length === 0 ? (
            <p className="muted">{t('availability.none')}</p>
          ) : (
            <ul className="window-list">
              {windows.map((w) => (
                <li key={w.startAt}>
                  {formatTime(w.startAt, language)} – {formatTime(w.endAt, language)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {createdSlots.length > 0 && (
        <div className="card stack">
          <ul className="window-list">
            {createdSlots.map((slot) => (
              <li key={slot.id}>
                {slot.startAt.slice(0, 10)} · {formatTime(slot.startAt, language)} –{' '}
                {formatTime(slot.endAt, language)}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('availability.remove')}
                  onClick={() => removeSlot(slot.id)}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path
                      d="M3 3 L13 13 M13 3 L3 13"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
